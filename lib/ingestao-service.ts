import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type { Root, RootContent } from 'mdast';
import type { Node } from 'unist';
import { logger } from './logger';
import { getSetting, setSetting } from './settings';
import { getZetelById, slugify } from './zetel-service';
import type { ZetelFile } from '@/types/zetel-file';
import type { ZetelPage } from '@/types/zetel-page';

/**
 * Camada de serviço da ingestão (Módulo 3): toda a lógica de arquivos e do
 * pipeline determinístico "Processar". As rotas de API só chamam estas funções.
 *
 * Invariantes (CLAUDE.md):
 *  - Regra #1: SEM LLM no pipeline — só remark/unist, determinístico;
 *  - Regra #6/DT4: logs com id/zetelId/contagens — NUNCA filename ou conteúdo;
 *  - Regra #8: unicidade de anchor é composta (zetel_id, anchor);
 *  - Regra #9/DT2: imagens externas (http[s]) não são copiadas — sentinela no mapa;
 *  - reading_stale=1 nas MUTAÇÕES (add/remove/reorder) e após processZetel;
 *    renderZetel (Módulo 4) seta reading_stale=0 + last_built_at (badge "Leitura atualizada").
 */

/** Default do Spike A; configurável via settings `max_words_per_page`. */
const DEFAULT_MAX_WORDS = 1000;
/** Acima disso, copia mesmo assim mas registra aviso (sem bloquear) — calibração. */
const LARGE_IMAGE_BYTES = 2 * 1024 * 1024;
/** Sentinelas no mapa de imagens — o Módulo 4 os traduz em SVG placeholder. */
const IMG_BLOCKED = '__blocked__';
const IMG_NOTFOUND = '__notfound__';

export interface ProcessResult {
  pagesCount: number;
  filesProcessed: number;
  imagesCopied: number;
  imagesBlocked: number; // URLs externas (http[s]) bloqueadas
  imagesWarned: number; // imagens locais > 2 MB
}

interface ZetelFileRow {
  id: string;
  zetel_id: string;
  filename: string;
  order_index: number;
  content_hash: string | null;
  size_bytes: number | null;
  last_seen_mtime: number | null;
  created_at: string;
  updated_at: string;
}

function rowToFile(row: ZetelFileRow): ZetelFile {
  return {
    id: row.id,
    zetelId: row.zetel_id,
    filename: row.filename,
    orderIndex: row.order_index,
    contentHash: row.content_hash,
    sizeBytes: row.size_bytes,
    lastSeenMtime: row.last_seen_mtime,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function arquivosDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'arquivos');
}

function imagesDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'images');
}

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Marca o Zetel como precisando reprocessar a leitura (mutações de arquivo). */
function markStale(db: Database.Database, zetelId: string): void {
  db.prepare('UPDATE zetels SET reading_stale = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    zetelId,
  );
}

/** Verifica que o Zetel existe e não está na lixeira; retorna o slug. */
export function assertZetelAtivo(db: Database.Database, zetelId: string): string {
  const zetel = getZetelById(db, zetelId);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }
  if (zetel.trashedAt) {
    throw new Error('Este Zetel está na lixeira.');
  }
  return zetel.slug;
}

/**
 * Resolve um nome de destino sem colisão dentro de `dir`. Se `<name>` existe,
 * tenta `<stem>-2.ext`, `<stem>-3.ext`… até -99. Determinístico para um dado
 * estado do diretório. Usado por addFile e pela cópia de imagens.
 */
function resolveSemColisao(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;

  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; n <= 99; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  // Regra #6: sem filename na mensagem (as rotas logam error.message).
  throw new Error('Não foi possível resolver um nome de arquivo livre (esgotadas as variações até -99).');
}

// ---------------------------------------------------------------------------
// Funções de arquivo
// ---------------------------------------------------------------------------

/**
 * Anexa um arquivo `.md` ao Zetel: valida extensão, copia para `arquivos/` sem
 * colisão, registra em `zetel_files` (ainda não processado: hashes nulos) e
 * marca `reading_stale = 1`.
 */
export function addFile(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  sourceFilePath: string,
): ZetelFile {
  const slug = assertZetelAtivo(db, zetelId);

  if (extname(sourceFilePath).toLowerCase() !== '.md') {
    throw new Error('Apenas arquivos .md são aceitos.');
  }

  const dir = arquivosDir(vaultPath, slug);
  mkdirSync(dir, { recursive: true });

  const destName = resolveSemColisao(dir, basename(sourceFilePath));
  try {
    copyFileSync(sourceFilePath, join(dir, destName));
  } catch {
    // Regra #6: o erro de fs traz o caminho (com filename) — não o propagamos.
    throw new Error('Falha ao copiar o arquivo para o vault.');
  }

  const maxRow = db
    .prepare('SELECT MAX(order_index) AS m FROM zetel_files WHERE zetel_id = ?')
    .get(zetelId) as { m: number | null };
  const orderIndex = maxRow.m === null ? 0 : maxRow.m + 1;

  const now = new Date().toISOString();
  const id = randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO zetel_files
         (id, zetel_id, filename, order_index, content_hash, size_bytes, last_seen_mtime, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    ).run(id, zetelId, destName, orderIndex, now, now);
    markStale(db, zetelId);
  })();

  logger.info('zetel file added', { id, zetelId });
  return rowToFile(
    db.prepare('SELECT * FROM zetel_files WHERE id = ?').get(id) as ZetelFileRow,
  );
}

/**
 * Lista os arquivos do Zetel por `order_index`, preenchendo `driftDetected`:
 * arquivo ausente, ou mtime/size diferentes COM hash diferente → drift (marca
 * `reading_stale = 1`). Otimização: só recalcula o hash quando mtime ou size
 * mudaram (calibração Spike A: touch sem mudança de conteúdo não é drift).
 */
export function listFiles(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
): ZetelFile[] {
  const slug = assertZetelAtivo(db, zetelId);
  const dir = arquivosDir(vaultPath, slug);

  const rows = db
    .prepare('SELECT * FROM zetel_files WHERE zetel_id = ? ORDER BY order_index ASC')
    .all(zetelId) as ZetelFileRow[];

  let anyDrift = false;
  const files = rows.map((row) => {
    const file = rowToFile(row);
    const path = join(dir, row.filename);

    if (!existsSync(path)) {
      file.driftDetected = true;
      anyDrift = true;
      return file;
    }

    // Arquivo nunca processado (hash nulo) não tem baseline para comparar.
    if (row.content_hash === null) {
      return file;
    }

    const st = statSync(path);
    const mtime = Math.floor(st.mtimeMs);
    if (mtime !== row.last_seen_mtime || st.size !== row.size_bytes) {
      const currentHash = sha256(readFileSync(path));
      if (currentHash !== row.content_hash) {
        file.driftDetected = true;
        anyDrift = true;
      }
    }
    return file;
  });

  if (anyDrift) {
    markStale(db, zetelId);
  }
  return files;
}

/**
 * Reordena os arquivos: reescreve `order_index` pela posição em `orderedIds`.
 * Valida que todos os IDs pertencem ao Zetel (e que o conjunto bate). Sem
 * operação no disco — só SQLite. Marca `reading_stale = 1`.
 */
export function reorderFiles(
  db: Database.Database,
  zetelId: string,
  orderedIds: string[],
): void {
  assertZetelAtivo(db, zetelId);

  const rows = db
    .prepare('SELECT id FROM zetel_files WHERE zetel_id = ?')
    .all(zetelId) as { id: string }[];
  const owned = new Set(rows.map((r) => r.id));

  if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
    throw new Error('A lista de ordenação não corresponde aos arquivos deste Zetel.');
  }

  const update = db.prepare('UPDATE zetel_files SET order_index = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, now, id));
    markStale(db, zetelId);
  })();

  logger.info('zetel files reordered', { zetelId, count: orderedIds.length });
}

/**
 * Remove um arquivo: apaga do disco (ausência não é fatal — pode ter sido
 * removido à mão), deleta o registro, recompacta `order_index` para eliminar
 * lacunas e marca `reading_stale = 1`.
 */
export function removeFile(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  fileId: string,
): void {
  const slug = assertZetelAtivo(db, zetelId);

  const row = db
    .prepare('SELECT * FROM zetel_files WHERE id = ? AND zetel_id = ?')
    .get(fileId, zetelId) as ZetelFileRow | undefined;
  if (!row) {
    throw new Error('Arquivo não encontrado neste Zetel.');
  }

  const path = join(arquivosDir(vaultPath, slug), row.filename);
  try {
    rmSync(path, { force: true });
  } catch (err) {
    // Regra #6: a mensagem de fs traz o caminho (com filename) — logamos só o código.
    logger.warn('zetel file disk remove failed', {
      fileId,
      code: (err as NodeJS.ErrnoException).code ?? 'unknown',
    });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM zetel_files WHERE id = ?').run(fileId);

    // Recompacta order_index (0,1,2…) na ordem atual.
    const remaining = db
      .prepare('SELECT id FROM zetel_files WHERE zetel_id = ? ORDER BY order_index ASC')
      .all(zetelId) as { id: string }[];
    const update = db.prepare('UPDATE zetel_files SET order_index = ? WHERE id = ?');
    remaining.forEach((r, index) => update.run(index, r.id));

    markStale(db, zetelId);
  })();

  logger.info('zetel file removed', { fileId, zetelId });
}

interface ZetelPageRow {
  id: number;
  zetel_id: string;
  page_index: number;
  heading: string;
  anchor: string;
  content_text: string;
  content_hash: string;
  created_at: string;
}

function rowToPage(row: ZetelPageRow): ZetelPage {
  return {
    id: row.id,
    zetelId: row.zetel_id,
    pageIndex: row.page_index,
    heading: row.heading,
    anchor: row.anchor,
    contentText: row.content_text,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

/** Lista páginas persistidas do Zetel, ordenadas por `page_index`. */
export function listPages(db: Database.Database, zetelId: string): ZetelPage[] {
  assertZetelAtivo(db, zetelId);
  const rows = db
    .prepare('SELECT * FROM zetel_pages WHERE zetel_id = ? ORDER BY page_index ASC')
    .all(zetelId) as ZetelPageRow[];
  return rows.map(rowToPage);
}

// ---------------------------------------------------------------------------
// Processamento (pipeline determinístico — Regra #1: sem LLM)
// ---------------------------------------------------------------------------

/** Texto plano de um nó MDAST (concatena `value` recursivamente). */
export function toPlainText(node: Node): string {
  const n = node as Node & { value?: unknown; children?: Node[] };
  if (typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(toPlainText).join('');
  return '';
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function isHeading(node: RootContent): node is RootContent & { depth: number } {
  return node.type === 'heading';
}

/** Página em construção durante a segmentação. */
interface DraftPage {
  heading: string | null;
  anchor: string | null;
  nodes: RootContent[];
  words: number;
}

export interface SegmentedPage {
  heading: string;
  anchor: string;
  contentText: string;
  nodes: RootContent[];
}

/**
 * Remove apenas frontmatter YAML no início do documento. O restante do Markdown
 * permanece intacto para preservar anchors/content_hash determinísticos.
 */
export function stripInitialYamlFrontmatter(tree: Root): Root {
  while (tree.children[0]?.type === 'yaml') {
    tree.children.shift();
  }
  return tree;
}

/**
 * Parser compartilhado por Processar e Preparar leitura. A paridade entre os
 * dois caminhos depende desta ordem: GFM + frontmatter + math, depois strip.
 */
export function parseMarkdownForSegmentation(markdown: string): Root {
  const tree = remark()
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath)
    .parse(markdown) as Root;

  return stripInitialYamlFrontmatter(tree);
}

/**
 * Gera anchors únicos dentro do Zetel. Headings recebem prefixo do stem do
 * arquivo (`stem--slug-do-heading`); colisões ganham sufixo `-2`, `-3`…
 */
export function makeAnchorFactory(used: Set<string>) {
  return (base: string): string => {
    let candidate = base || 'secao';
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    for (let n = 2; ; n++) {
      candidate = `${base}-${n}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };
}

/**
 * Segmenta um único arquivo em páginas. Nova página ao encontrar H1/H2 (com
 * conteúdo acumulado) ou ao atingir `maxWords`. `startIndex` é o page_index
 * global (contínuo entre arquivos) usado para nomear páginas sem heading.
 * Decisão do usuário: nenhuma página mistura dois arquivos.
 */
export function segmentFile(
  tree: Root,
  stem: string,
  maxWords: number,
  startIndex: number,
  anchorOf: (base: string) => string,
): SegmentedPage[] {
  const pages: SegmentedPage[] = [];
  let draft: DraftPage | null = null;

  // Recebe o draft por argumento (não captura `draft`) para não confundir a
  // análise de fluxo do TS — quem chama é responsável por zerar `draft`.
  const pushPage = (d: DraftPage) => {
    const pageIndex = startIndex + pages.length;
    const heading = d.heading ?? '[sem título]';
    const anchor = d.anchor ?? anchorOf(`pagina-${pageIndex}`);
    const contentText = d.nodes.map(toPlainText).join('\n\n').trim();
    pages.push({ heading, anchor, contentText, nodes: d.nodes });
  };

  const emptyDraft = (): DraftPage => ({ heading: null, anchor: null, nodes: [], words: 0 });

  for (const node of tree.children) {
    if (isHeading(node) && (node.depth === 1 || node.depth === 2)) {
      // Fronteira de página: fecha a anterior se já tinha conteúdo.
      if (draft && draft.words > 0) {
        pushPage(draft);
        draft = null;
      }
      if (!draft) draft = emptyDraft();
      if (draft.heading === null) {
        const text = toPlainText(node).trim();
        draft.heading = text || '[sem título]';
        draft.anchor = anchorOf(`${stem}--${slugify(text)}`);
      }
      draft.nodes.push(node);
      draft.words += countWords(toPlainText(node));
    } else {
      if (!draft) draft = emptyDraft();
      draft.nodes.push(node);
      draft.words += countWords(toPlainText(node));
    }

    if (draft && draft.words >= maxWords) {
      pushPage(draft);
      draft = null;
    }
  }
  if (draft && draft.nodes.length > 0) pushPage(draft);

  return pages;
}

/** Resolve e copia (ou bloqueia) as imagens de um arquivo, alimentando o mapa. */
function processImages(
  tree: Root,
  mdPath: string,
  imgDir: string,
  imageMap: Record<string, string>,
  zetelId: string,
  counters: { copied: number; blocked: number; warned: number },
): void {
  visit(tree, 'image', (node) => {
    const url = node.url;
    if (!url || url in imageMap) return;

    if (/^https?:\/\//i.test(url)) {
      imageMap[url] = IMG_BLOCKED; // Regra #9/DT2: nunca renderizar URL externa.
      counters.blocked++;
      return;
    }

    const sourcePath = resolve(dirname(mdPath), url);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      imageMap[url] = IMG_NOTFOUND;
      return;
    }

    const size = statSync(sourcePath).size;
    if (size > LARGE_IMAGE_BYTES) {
      logger.warn('zetel image oversized', { zetelId, sizeBytes: size });
      counters.warned++;
    }

    const destName = resolveSemColisao(imgDir, basename(sourcePath));
    try {
      copyFileSync(sourcePath, join(imgDir, destName));
    } catch (err) {
      // Cópia falhou: degrada para sentinela (Módulo 4 põe placeholder) em vez
      // de derrubar o processo. Regra #6: só o código do erro, nunca o caminho.
      logger.warn('zetel image copy failed', {
        zetelId,
        code: (err as NodeJS.ErrnoException).code ?? 'unknown',
      });
      imageMap[url] = IMG_NOTFOUND;
      return;
    }
    imageMap[url] = `images/${destName}`;
    counters.copied++;
  });
}

/**
 * "Processar": lê os arquivos na ordem, gera a estrutura intermediária (páginas
 * segmentadas + mapa de imagens) e persiste em `zetel_pages`/`settings`.
 * Determinístico e idempotente: mesmo input → mesmas páginas e mesmos hashes.
 */
export function processZetel(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
): ProcessResult {
  const slug = assertZetelAtivo(db, zetelId);

  const rows = db
    .prepare('SELECT * FROM zetel_files WHERE zetel_id = ? ORDER BY order_index ASC')
    .all(zetelId) as ZetelFileRow[];

  // Passo 1 — ler e validar TODOS os arquivos antes de qualquer escrita.
  const dir = arquivosDir(vaultPath, slug);
  const loaded = rows.map((row) => {
    const path = join(dir, row.filename);
    if (!existsSync(path)) {
      // Regra #6: a mensagem (que as rotas logam) NÃO pode conter o filename —
      // a aba Arquivos já sinaliza o arquivo faltante com o badge de drift.
      throw new Error(
        'Um arquivo deste Zetel não foi encontrado em arquivos/ (pode ter sido removido fora do app). ' +
          'Verifique a aba Arquivos e reprocesse.',
      );
    }
    const buf = readFileSync(path);
    const st = statSync(path);
    return {
      row,
      path,
      content: buf.toString('utf8'),
      hash: sha256(buf),
      size: st.size,
      mtime: Math.floor(st.mtimeMs),
    };
  });

  // Imagens são regeneráveis: limpa o diretório para que a cópia seja
  // idempotente (resolveSemColisao parte de um diretório vazio a cada run).
  const imgDir = imagesDir(vaultPath, slug);
  rmSync(imgDir, { recursive: true, force: true });
  mkdirSync(imgDir, { recursive: true });

  const maxWords = Number(getSetting('max_words_per_page')) || DEFAULT_MAX_WORDS;
  const imageMap: Record<string, string> = {};
  const counters = { copied: 0, blocked: 0, warned: 0 };
  const anchorOf = makeAnchorFactory(new Set<string>());

  // Passos 2–5 — parsear, processar imagens e segmentar por arquivo.
  const pages: SegmentedPage[] = [];
  for (const file of loaded) {
    const tree = parseMarkdownForSegmentation(file.content);
    processImages(tree, file.path, imgDir, imageMap, zetelId, counters);

    const stem = slugify(basename(file.row.filename, extname(file.row.filename)));
    const filePages = segmentFile(tree, stem, maxWords, pages.length, anchorOf);
    pages.push(...filePages);
  }

  // Passos 6–8 — persistir tudo numa transação.
  const now = new Date().toISOString();
  db.transaction(() => {
    const updateFile = db.prepare(
      'UPDATE zetel_files SET content_hash = ?, size_bytes = ?, last_seen_mtime = ?, updated_at = ? WHERE id = ?',
    );
    for (const f of loaded) {
      updateFile.run(f.hash, f.size, f.mtime, now, f.row.id);
    }

    db.prepare('DELETE FROM zetel_pages WHERE zetel_id = ?').run(zetelId);
    const insertPage = db.prepare(
      `INSERT INTO zetel_pages (zetel_id, page_index, heading, anchor, content_text, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    pages.forEach((p, index) => {
      insertPage.run(zetelId, index, p.heading, p.anchor, p.contentText, sha256(p.contentText), now);
    });

    // Estrutura atualizada: HTML em artefatos/ fica desatualizado até renderZetel (Módulo 4).
    db.prepare('UPDATE zetels SET reading_stale = 1, updated_at = ? WHERE id = ?').run(now, zetelId);

    setSetting(`image_map_${zetelId}`, JSON.stringify(imageMap));
  })();

  const result: ProcessResult = {
    pagesCount: pages.length,
    filesProcessed: loaded.length,
    imagesCopied: counters.copied,
    imagesBlocked: counters.blocked,
    imagesWarned: counters.warned,
  };

  logger.info('zetel processed', {
    zetelId,
    pages: result.pagesCount,
    files: result.filesProcessed,
    imagesCopied: result.imagesCopied,
  });
  return result;
}
