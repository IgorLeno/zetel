/**
 * Importação dos relatórios do canal (SPEC-018 RF2–RF4, D6/D7): traz os
 * relatórios válidos de `inbox/<slug>/` para o Zetel, como material comum.
 *
 * Por relatório, tudo ou nada: imagens são gravadas em
 * `imagens/relatorios/` (temporário + fsync + rename), os links do relatório
 * são reescritos para elas e o relatório entra via `addFile` em
 * `arquivos/relatorios/` na MESMA transação SQLite que registra a versão em
 * `channel_imports`. Qualquer falha desfaz a transação e apaga o que já foi
 * escrito no vault. Tudo é síncrono (better-sqlite3 + fs), então duas
 * importações nunca se intercalam no processo.
 *
 * Logs (RNF2): só `zetelId` e contagens; nunca nome de arquivo, caminho,
 * título ou conteúdo.
 */
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type { Definition, Root } from 'mdast';
import { loadReportImages, scanZetelInbox, type InboxImage, type InboxReport } from './channel-inbox';
import { addFile, resolveSemColisao } from './ingestao-service';
import { logger } from './logger';
import { getZetelById } from './zetel-service';

export interface ImportSummary {
  imported: number;
  skipped: number;
  invalid: number;
}

export class ReportImportError extends Error {
  constructor(readonly code: 'not_found') {
    super('Zetel não encontrado.');
  }
}

/** Reescrita de links que não pôde ser confirmada: o relatório é recusado. */
class RewriteFailed extends Error {}

/** Link relativo a `arquivos/relatorios/<relatório>.md`. */
const IMAGE_LINK_PREFIX = '../../imagens/relatorios/';

export function importZetelReports(
  db: Database.Database,
  vaultPath: string,
  channelDir: string,
  zetelId: string,
): ImportSummary {
  const zetel = getZetelById(db, zetelId);
  if (!zetel) throw new ReportImportError('not_found');

  const alreadyImported = db.prepare(
    'SELECT 1 FROM channel_imports WHERE zetel_id = ? AND channel_path = ? AND content_hash = ?',
  );
  // Identidade D6 consultada antes do parse: o que já entrou não custa remark.
  const scan = scanZetelInbox(channelDir, zetel.slug, (channelPath, contentHash) =>
    Boolean(alreadyImported.get(zetelId, channelPath, contentHash)),
  );
  const summary: ImportSummary = { imported: 0, skipped: scan.known, invalid: scan.invalid.length };

  if (zetel.trashedAt) {
    // Slug na lixeira: nada entra, mas cada relatório é contado.
    summary.invalid += scan.reports.length;
  } else {
    for (const report of scan.reports) {
      const images = loadReportImages(channelDir, zetel.slug, report.parsed.imageRefs);
      if (!images.ok) {
        summary.invalid += 1;
        continue;
      }
      try {
        importOne(db, vaultPath, zetelId, zetel.slug, report, images.images);
        summary.imported += 1;
      } catch (error) {
        summary.invalid += 1;
        if (!(error instanceof RewriteFailed)) {
          logger.warn('channel report import failed', {
            zetelId,
            code: (error as NodeJS.ErrnoException).code ?? 'unknown',
          });
        }
      }
    }
  }

  logger.info('channel reports imported', { zetelId, ...summary });
  return summary;
}

function importOne(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  slug: string,
  report: InboxReport,
  images: InboxImage[],
): void {
  const zetelDir = join(vaultPath, 'zetels', slug);
  const written: string[] = [];
  const staging = mkdtempSync(join(tmpdir(), 'zetel-report-'));
  try {
    const links = new Map<string, string>();
    if (images.length > 0) {
      const imageDir = join(zetelDir, 'imagens', 'relatorios');
      mkdirSync(imageDir, { recursive: true });
      // Uma de cada vez: o nome livre considera as imagens já gravadas deste relatório.
      for (const image of images) {
        const finalName = resolveSemColisao(imageDir, image.name);
        writeAtomic(imageDir, finalName, image.bytes);
        written.push(join(imageDir, finalName));
        links.set(image.name, `${IMAGE_LINK_PREFIX}${finalName}`);
      }
    }

    const stagedPath = join(staging, report.fileName);
    writeFileSync(stagedPath, rewriteImageLinks(report.markdown, links));

    const now = new Date().toISOString();
    const importId = randomUUID();
    db.transaction(() => {
      const file = addFile(db, vaultPath, zetelId, stagedPath, undefined, {
        subdir: 'relatorios',
        sourceKind: 'chatgpt_report',
        sourcePath: report.channelPath,
      });
      written.push(join(zetelDir, 'arquivos', file.filename));

      const previous = db
        .prepare("SELECT id FROM channel_imports WHERE zetel_id = ? AND channel_path = ? AND status <> 'superseded'")
        .all(zetelId, report.channelPath) as { id: string }[];

      db.prepare(
        `INSERT INTO channel_imports
           (id, zetel_id, file_id, channel_path, content_hash, status, superseded_by, imported_at)
         VALUES (?, ?, ?, ?, ?, 'imported', NULL, ?)`,
      ).run(importId, zetelId, file.id, report.channelPath, report.contentHash, now);

      // D6: versões anteriores do mesmo caminho saem de cena; candidatos
      // pendentes delas são rejeitados, os confirmados ficam.
      const supersede = db.prepare("UPDATE channel_imports SET status = 'superseded', superseded_by = ? WHERE id = ?");
      const rejectPending = db.prepare(
        "UPDATE curation_candidates SET status = 'rejected', decided_at = ? WHERE import_id = ? AND status = 'pending'",
      );
      for (const { id } of previous) {
        supersede.run(importId, id);
        rejectPending.run(now, id);
      }
    })();
  } catch (error) {
    for (const path of written) rmSync(path, { force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Grava `bytes` em `dir/name` via temporário + fsync + rename. */
function writeAtomic(dir: string, name: string, bytes: Buffer): void {
  const tmpPath = join(dir, `.tmp-${randomUUID()}`);
  try {
    const fd = openSync(tmpPath, 'wx', 0o644);
    try {
      writeSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, join(dir, name));
  } catch (error) {
    rmSync(tmpPath, { force: true });
    throw error;
  }
}

function parseMarkdown(markdown: string): Root {
  return remark().use(remarkGfm).use(remarkFrontmatter, ['yaml']).use(remarkMath).parse(markdown) as Root;
}

/**
 * URL de cada imagem do documento, em ordem, resolvendo referências por
 * rótulo (todas as definições do rótulo, como no parser da tarefa 002).
 */
function imageUrls(tree: Root): string[] {
  const definitions = new Map<string, Definition[]>();
  visit(tree, 'definition', (node) => {
    definitions.set(node.identifier, [...(definitions.get(node.identifier) ?? []), node]);
  });
  const urls: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'image') urls.push(node.url);
    if (node.type === 'imageReference') {
      for (const definition of definitions.get(node.identifier) ?? []) urls.push(definition.url);
    }
  });
  return urls;
}

/**
 * Troca o destino de cada imagem local pelo link em `imagens/relatorios/`,
 * editando só o trecho do destino no texto original (o resto do relatório fica
 * byte a byte igual). O destino é localizado dentro da posição do nó; como a
 * busca é textual, o resultado é reparseado e só é aceito se TODA imagem
 * apontar exatamente para o link esperado — senão o relatório é recusado.
 */
function rewriteImageLinks(markdown: string, links: ReadonlyMap<string, string>): string {
  const tree = parseMarkdown(markdown);
  const before = imageUrls(tree);
  if (before.length === 0) return markdown;

  const edits: { start: number; end: number; url: string }[] = [];
  visit(tree, (node) => {
    if (node.type !== 'image' && node.type !== 'definition') return;
    const url = links.get(node.url);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (url === undefined || start === undefined || end === undefined) return;
    const opener = node.type === 'image' ? String.raw`\]\(\s*<?` : String.raw`\]:\s*<?`;
    const name = node.url.replace(/[.-]/g, '\\$&');
    const match = new RegExp(`${opener}(${name})(?=>?(?:\\s|\\)|$))`).exec(markdown.slice(start, end));
    if (!match) throw new RewriteFailed();
    const offset = start + match.index + match[0].length - match[1].length;
    edits.push({ start: offset, end: offset + match[1].length, url });
  });

  let rewritten = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    rewritten = rewritten.slice(0, edit.start) + edit.url + rewritten.slice(edit.end);
  }

  const after = imageUrls(parseMarkdown(rewritten));
  const expected = before.map((url) => links.get(url));
  if (after.length !== expected.length || after.some((url, index) => url !== expected[index])) {
    throw new RewriteFailed();
  }
  return rewritten;
}
