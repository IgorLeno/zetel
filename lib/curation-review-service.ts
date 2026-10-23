/**
 * Revisão humana da curadoria (SPEC-018 RF7): o Igor confirma, edita ou
 * rejeita cada candidato pendente; só o confirmado vai ao vault.
 *
 * - Nota e conceito usam os serviços existentes (`saveNote` com
 *   `origem: relatorio`, `saveConcept`); passo a passo e questão ganham
 *   arquivo próprio em `passo-a-passo/` e `questoes/`, criado por temporário +
 *   `link` (nunca sobrescreve, nunca deixa arquivo parcial).
 * - Proveniência (relatório, anchor, hash, datas) vem de `channel_imports`,
 *   `zetel_files` e do `source` gravado pelo servidor na curadoria; o cliente
 *   só manda o id do candidato, a ação e, opcionalmente, os campos editados,
 *   revalidados com as regras da curadoria.
 * - A decisão é reivindicada (`pending` → `confirmed`) e o vault é escrito na
 *   MESMA transação: falha na escrita desfaz a decisão; dois cliques nunca
 *   gravam duas vezes.
 * - Texto do relatório vai ao vault inerte: sem HTML, sem imagem nem embed
 *   (imagens externas ficam bloqueadas).
 * - Logs (RNF2): só IDs, tipo e ação.
 */
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findConcept, listConcepts, saveConcept, type ReportConceptProvenance } from './concepts-service';
import { CURATION_KINDS, parseCandidatePayload, type CandidatePayload, type CurationKind } from './curation-service';
import { logger } from './logger';
import { saveNote } from './notes-service';
import { getZetelById, slugify } from './zetel-service';

export type CandidateAction = 'confirm' | 'reject';

export interface ReviewCandidate {
  id: string;
  kind: CurationKind;
  anchor: string;
  section: string[];
  fields: Omit<CandidatePayload, 'kind'>;
}

export interface ReviewReport {
  importId: string;
  /** Caminho do relatório dentro de `arquivos/` (ex.: `relatorios/x.md`). */
  filename: string | null;
  importedAt: string;
  status: string;
  candidates: ReviewCandidate[];
}

export interface DecisionResult {
  id: string;
  status: 'confirmed' | 'rejected';
  /** Caminho relativo ao vault do arquivo gravado (confirmar). */
  path?: string;
}

export class CurationReviewError extends Error {
  constructor(readonly code: 'not_found' | 'not_pending' | 'invalid_edit' | 'corrupted') {
    super(code);
  }
}

interface CandidateRow {
  id: string;
  import_id: string;
  kind: CurationKind;
  anchor: string;
  payload: string;
  status: string;
}

interface ImportRow {
  id: string;
  file_id: string | null;
  filename: string | null;
  imported_at: string;
  status: string;
}

interface StoredPayload {
  source?: { contentHash?: unknown; section?: unknown };
  [field: string]: unknown;
}

function readStored(row: CandidateRow): { payload: CandidatePayload; contentHash: string; section: string[] } {
  let stored: StoredPayload;
  try {
    stored = JSON.parse(row.payload) as StoredPayload;
  } catch {
    throw new CurationReviewError('corrupted');
  }
  const { source, ...fields } = stored;
  const payload = parseCandidatePayload(row.kind, fields);
  // Gravado pelo próprio servidor na curadoria: falha aqui é corrupção, não entrada do cliente.
  if (!payload || typeof source?.contentHash !== 'string') throw new CurationReviewError('corrupted');
  const section = Array.isArray(source.section) ? source.section.filter((s): s is string => typeof s === 'string') : [];
  return { payload, contentHash: source.contentHash, section };
}

/** Versões vigentes do Zetel (mais recentes primeiro) com seus candidatos pendentes. */
export function listCuration(db: Database.Database, zetelId: string): ReviewReport[] {
  const imports = db
    .prepare(
      `SELECT ci.id, ci.file_id, f.filename, ci.imported_at, ci.status FROM channel_imports ci
       LEFT JOIN zetel_files f ON f.id = ci.file_id
       WHERE ci.zetel_id = ? AND ci.status <> 'superseded'
       ORDER BY ci.imported_at DESC, ci.rowid DESC`,
    )
    .all(zetelId) as ImportRow[];
  const pending = db.prepare(
    "SELECT * FROM curation_candidates WHERE import_id = ? AND status = 'pending' ORDER BY rowid",
  );
  return imports.map((imp) => ({
    importId: imp.id,
    filename: imp.filename,
    importedAt: imp.imported_at,
    status: imp.status,
    candidates: (pending.all(imp.id) as CandidateRow[]).flatMap((row): ReviewCandidate[] => {
      try {
        const { payload, section } = readStored(row);
        const { kind, ...fields } = payload;
        return [{ id: row.id, kind, anchor: row.anchor, section, fields }];
      } catch (error) {
        if (!(error instanceof CurationReviewError)) throw error;
        // Uma linha ilegível não esconde as demais.
        logger.warn('curation candidate unreadable', { candidateId: row.id });
        return [];
      }
    }),
  }));
}

/**
 * Aplica a decisão. `edit` (só em confirmar) substitui os campos do tipo e é
 * validado como uma resposta da LLM; tipo e anchor nunca mudam.
 */
export function decideCandidate(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  candidateId: string,
  action: CandidateAction,
  edit?: unknown,
): DecisionResult {
  const zetel = getZetelById(db, zetelId);
  if (!zetel || zetel.trashedAt) throw new CurationReviewError('not_found');
  const row = db
    .prepare(
      `SELECT c.* FROM curation_candidates c JOIN channel_imports ci ON ci.id = c.import_id
       WHERE c.id = ? AND ci.zetel_id = ?`,
    )
    .get(candidateId, zetelId) as CandidateRow | undefined;
  if (!row || !(CURATION_KINDS as readonly string[]).includes(row.kind)) throw new CurationReviewError('not_found');
  if (row.status !== 'pending') throw new CurationReviewError('not_pending');

  const stored = readStored(row);
  let payload = stored.payload;
  if (action === 'confirm' && edit !== undefined) {
    const edited = parseCandidatePayload(row.kind, edit);
    if (!edited) throw new CurationReviewError('invalid_edit');
    payload = edited;
  }

  const now = new Date().toISOString();
  const result = db.transaction((): DecisionResult => {
    // Reivindica a decisão antes de escrever: um segundo clique perde aqui.
    const claimed = db
      .prepare(
        "UPDATE curation_candidates SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
      )
      .run(action === 'confirm' ? 'confirmed' : 'rejected', now, candidateId);
    if (claimed.changes !== 1) throw new CurationReviewError('not_pending');
    if (action === 'reject') return { id: candidateId, status: 'rejected' };

    const imp = db
      .prepare(
        `SELECT ci.id, ci.file_id, f.filename, ci.imported_at, ci.status FROM channel_imports ci
         LEFT JOIN zetel_files f ON f.id = ci.file_id WHERE ci.id = ?`,
      )
      .get(row.import_id) as ImportRow;
    if (imp.status === 'superseded') throw new CurationReviewError('not_pending');
    const origin = { zetelId, slug: zetel.slug, imp, candidateId, anchor: row.anchor, contentHash: stored.contentHash, now };
    return { id: candidateId, status: 'confirmed', path: writeConfirmed(vaultPath, payload, origin) };
  })();

  logger.info('curation candidate decided', { zetelId, candidateId, kind: row.kind, action });
  return result;
}

interface Origin {
  zetelId: string;
  slug: string;
  imp: ImportRow;
  candidateId: string;
  anchor: string;
  contentHash: string;
  now: string;
}

const CURATION_MODEL_LABEL = 'curadoria';

function writeConfirmed(vaultPath: string, payload: CandidatePayload, origin: Origin): string {
  const reference = `${origin.imp.filename ?? 'relatorio'}#${origin.anchor}`;
  switch (payload.kind) {
    case 'nota':
      return saveNote(vaultPath, origin.slug, {
        tipo: 'rapida',
        titulo: inertLine(payload.titulo),
        corpo: inert(payload.corpo),
        paginaOrigem: reference,
        modelo: CURATION_MODEL_LABEL,
        origem: 'relatorio',
      }).path;
    case 'conceito': {
      const name = inertLine(payload.nome);
      const match = findConcept(listConcepts(vaultPath, origin.slug), name);
      const provenance: ReportConceptProvenance = {
        origin: 'chatgpt_report',
        zetel_id: origin.zetelId,
        import_id: origin.imp.id,
        candidate_id: origin.candidateId,
        file_id: origin.imp.file_id,
        filename: origin.imp.filename,
        anchor: origin.anchor,
        content_hash: origin.contentHash,
        imported_at: origin.imp.imported_at,
        saved_at: origin.now,
      };
      const saved = saveConcept(vaultPath, origin.slug, {
        action: match ? 'append' : 'create',
        conceptSlug: match?.slug,
        name,
        aliases: [],
        userFormulation: null,
        // `quote()` do serviço já escapa HTML; aqui só a imagem/embed.
        partnerFormulation: noImages(payload.definicao),
        provenance,
        sessionTitle: null,
      });
      return `zetels/${origin.slug}/conceitos/${saved.slug}.md`;
    }
    case 'passo_a_passo':
      return writeOwnFile(vaultPath, origin, 'passo-a-passo', payload.titulo,
        payload.passos.map((step, index) => `${index + 1}. ${inert(step)}`).join('\n'));
    case 'questao':
      return writeOwnFile(vaultPath, origin, 'questoes', payload.enunciado.split('\n')[0].slice(0, 80),
        `${inert(payload.enunciado)}\n\n**Resposta:** ${payload.resposta ? inert(payload.resposta) : '_sem resposta no relatório_'}`);
  }
}

/** Texto do relatório inerte no vault: sem HTML, imagem ou embed do Obsidian. */
function inert(text: string): string {
  return noImages(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

/**
 * Título/nome: o Obsidian renderiza HTML até em `# título`, então `<` vira
 * entidade (nenhuma tag sobrevive), mas `&` e `>` ficam como digitados para
 * não estragar nome de arquivo, slug e a busca de conceito existente.
 */
function inertLine(text: string): string {
  return noImages(text.replace(/</g, '&lt;'));
}

function noImages(text: string): string {
  return text.replace(/!\[/g, '!\\[');
}

/** Valor de frontmatter: string JSON é YAML válido e não quebra linha. */
function scalar(value: string): string {
  return JSON.stringify(value);
}

/**
 * Cria `<vault>/zetels/<slug>/<dir>/<slug-do-título>.md` sem sobrescrever:
 * escreve um temporário e o publica com `link` (falha com EEXIST se o nome já
 * existe, e o próximo sufixo é tentado).
 */
function writeOwnFile(vaultPath: string, origin: Origin, dir: string, title: string, body: string): string {
  const target = join(vaultPath, 'zetels', origin.slug, dir);
  mkdirSync(target, { recursive: true });
  const heading = inertLine(title.replace(/[\r\n#]/g, ' ').trim());
  const content = [
    '---',
    `zetel: ${origin.slug}`,
    `tipo: ${dir}`,
    'origem: relatorio',
    `relatorio: ${scalar(origin.imp.filename ?? '')}`,
    `anchor: ${scalar(origin.anchor)}`,
    `content_hash: ${origin.contentHash}`,
    `importado_em: ${origin.imp.imported_at}`,
    `criada_em: ${origin.now}`,
    '---',
    '',
    `# ${heading}`,
    '',
    body,
    '',
  ].join('\n');

  const temp = join(target, `.tmp-${randomUUID()}`);
  writeFileSync(temp, content, { flag: 'wx' });
  try {
    const base = slugify(heading) || 'item';
    for (let n = 1; n <= 99; n += 1) {
      const name = n === 1 ? `${base}.md` : `${base}-${n}.md`;
      try {
        linkSync(temp, join(target, name));
        return `zetels/${origin.slug}/${dir}/${name}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    throw new Error('Não foi possível gerar um nome de arquivo livre (até -99).');
  } finally {
    rmSync(temp, { force: true });
  }
}
