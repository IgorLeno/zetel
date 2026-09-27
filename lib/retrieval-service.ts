import type Database from 'better-sqlite3';
import { logger } from './logger';

/** Teto de cada trecho recuperado no prompt (PLAN: ≤ 900 chars). */
export const RETRIEVAL_PASSAGE_MAX_CHARS = 900;

/** k máximo por turno (PLAN: k ≤ 4). */
export const RETRIEVAL_MAX_K = 4;

export interface PassageHit {
  text: string;
  sourceKind: 'pdf' | 'markdown';
  fileId: string;
  pageNumber: number;
  filename: string;
}

export interface RetrievePassagesInput {
  zetelId: string;
  query: string;
  /** Texto do foco local, usado quando a mensagem não tem termos de conteúdo. */
  focusText?: string;
  /** Página já enviada ao modelo; não volta no resultado. */
  exclude?: { fileId: string; pageNumber: number } | null;
  /** Restringe ao arquivo. `null` busca o Zetel inteiro. */
  fileId?: string | null;
  hint?: 'beginning' | 'end' | null;
  pageMin?: number | null;
  pageMax?: number | null;
  limit?: number;
}

const STOPWORDS = new Set([
  'isso', 'essa', 'esse', 'esta', 'este', 'aqui', 'para', 'como', 'sobre',
  'outra', 'outro', 'outras', 'outros', 'parte', 'partes', 'documento',
  'relaciona', 'relacionar', 'relacione', 'pagina', 'dessa', 'desse',
  'desta', 'deste', 'inteiro', 'inteira', 'livro', 'artigo', 'capitulo',
  'secao', 'comeco', 'final', 'primeira', 'ultimo', 'ultima', 'somente',
  'apenas', 'qual', 'quais', 'onde', 'quando', 'porque', 'entre', 'mais',
  'nao', 'com', 'por', 'dos', 'das', 'uma', 'uns',
]);

interface FtsRow {
  text: string;
  source_kind: string;
  file_id: string;
  page_ref: string;
}

function hasPassagesTable(db: Database.Database): boolean {
  return Boolean(
    db.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'passages_fts'",
    ).get(),
  );
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function contentTokens(text: string, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of fold(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= limit) break;
  }
  return out;
}

/** Consulta FTS só com tokens literais. `null` = nada seguro para buscar. */
export function buildFtsMatch(query: string, focusText = ''): { match: string; tokens: string[] } | null {
  const fromMessage = contentTokens(query, 8);
  const tokens = fromMessage.length >= 2
    ? fromMessage
    : [...fromMessage, ...contentTokens(focusText, 8)].filter((token, index, all) => all.indexOf(token) === index).slice(0, 8);
  if (tokens.length === 0) return null;
  return { match: tokens.map((token) => `"${token}"`).join(' OR '), tokens };
}

function excerpt(text: string, tokens: string[], hint: 'beginning' | 'end' | null): string {
  if (hint === 'end') {
    return text.length <= RETRIEVAL_PASSAGE_MAX_CHARS
      ? text
      : text.slice(text.length - RETRIEVAL_PASSAGE_MAX_CHARS);
  }
  if (hint === 'beginning' || tokens.length === 0) {
    return text.slice(0, RETRIEVAL_PASSAGE_MAX_CHARS);
  }
  const folded = fold(text);
  let at = -1;
  for (const token of tokens) {
    const found = folded.indexOf(token);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  const start = at === -1 ? 0 : Math.max(0, at - 120);
  return text.slice(start, start + RETRIEVAL_PASSAGE_MAX_CHARS);
}

/**
 * Reconstrói o índice do Zetel a partir das tabelas autoritativas.
 * Apaga só as linhas deste Zetel.
 */
export function rebuildZetelPassages(db: Database.Database, zetelId: string): void {
  if (!hasPassagesTable(db)) return;
  const write = db.transaction(() => {
    db.prepare('DELETE FROM passages_fts WHERE zetel_id = ?').run(zetelId);
    db.prepare(
      `INSERT INTO passages_fts (text, zetel_id, source_kind, file_id, page_ref)
       SELECT p.content_text, f.zetel_id, 'pdf', p.file_id, CAST(p.page_number AS TEXT)
         FROM pdf_pages p
         JOIN zetel_files f ON f.id = p.file_id
        WHERE f.zetel_id = ? AND length(trim(p.content_text)) > 0`,
    ).run(zetelId);
    db.prepare(
      `INSERT INTO passages_fts (text, zetel_id, source_kind, file_id, page_ref)
       SELECT content_text, zetel_id, 'markdown', '', CAST(page_index AS TEXT)
         FROM zetel_pages
        WHERE zetel_id = ? AND length(trim(content_text)) > 0`,
    ).run(zetelId);
  });
  write();
}

export function deleteFilePassages(db: Database.Database, fileId: string): void {
  if (!hasPassagesTable(db)) return;
  db.prepare('DELETE FROM passages_fts WHERE file_id = ?').run(fileId);
}

function ensureIndexed(db: Database.Database, zetelId: string): void {
  const indexed = db.prepare(
    'SELECT COUNT(*) AS n FROM passages_fts WHERE zetel_id = ?',
  ).get(zetelId) as { n: number };
  if (indexed.n > 0) return;
  const pages = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM pdf_pages p JOIN zetel_files f ON f.id = p.file_id WHERE f.zetel_id = ?)
       + (SELECT COUNT(*) FROM zetel_pages WHERE zetel_id = ?) AS n`,
  ).get(zetelId, zetelId) as { n: number };
  if (pages.n > 0) rebuildZetelPassages(db, zetelId);
}

function filenameOf(db: Database.Database, zetelId: string, row: FtsRow): string {
  if (row.source_kind === 'pdf' && row.file_id) {
    const file = db.prepare('SELECT filename FROM zetel_files WHERE id = ? AND zetel_id = ?')
      .get(row.file_id, zetelId) as { filename: string } | undefined;
    return file?.filename ?? 'Documento';
  }
  const page = db.prepare(
    'SELECT heading FROM zetel_pages WHERE zetel_id = ? AND page_index = ?',
  ).get(zetelId, Number(row.page_ref)) as { heading: string } | undefined;
  return page?.heading?.trim() || 'Documento';
}

function inRange(page: number, min: number | null | undefined, max: number | null | undefined): boolean {
  if (min != null && page < min) return false;
  if (max != null && page > max) return false;
  return true;
}

/**
 * Top-k lexical no Zetel atual. Texto vem do índice derivado, que por sua vez
 * só é preenchido a partir de `pdf_pages` / `zetel_pages`.
 */
export function retrievePassages(
  db: Database.Database,
  input: RetrievePassagesInput,
): PassageHit[] {
  if (!hasPassagesTable(db)) return [];
  ensureIndexed(db, input.zetelId);
  const limit = Math.min(RETRIEVAL_MAX_K, Math.max(1, input.limit ?? RETRIEVAL_MAX_K));
  const hint = input.hint ?? null;
  const built = hint ? null : buildFtsMatch(input.query, input.focusText ?? '');
  if (!hint && !built) return [];

  let rows: FtsRow[];
  try {
    if (hint) {
      rows = db.prepare(
        `SELECT text, source_kind, file_id, page_ref
           FROM passages_fts
          WHERE zetel_id = ?
            AND (? IS NULL OR file_id = ?)
          ORDER BY CAST(page_ref AS INTEGER) ${hint === 'end' ? 'DESC' : 'ASC'}`,
      ).all(input.zetelId, input.fileId ?? null, input.fileId ?? null) as FtsRow[];
    } else {
      rows = db.prepare(
        `SELECT text, source_kind, file_id, page_ref
           FROM passages_fts
          WHERE passages_fts MATCH ?
            AND zetel_id = ?
            AND (? IS NULL OR file_id = ?)
          ORDER BY bm25(passages_fts)`,
      ).all(built!.match, input.zetelId, input.fileId ?? null, input.fileId ?? null) as FtsRow[];
    }
  } catch (err) {
    logger.warn('passages query failed', {
      zetelId: input.zetelId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return [];
  }

  const hits: PassageHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pageNumber = Number(row.page_ref);
    if (!Number.isInteger(pageNumber)) continue;
    if (row.source_kind !== 'pdf' && row.source_kind !== 'markdown') continue;
    if (!inRange(pageNumber, input.pageMin, input.pageMax)) continue;
    if (input.exclude && input.exclude.fileId === row.file_id && input.exclude.pageNumber === pageNumber) {
      continue;
    }
    const key = `${row.file_id}:${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = excerpt(row.text, built?.tokens ?? [], hint);
    if (!text.trim()) continue;
    hits.push({
      text,
      sourceKind: row.source_kind,
      fileId: row.file_id,
      pageNumber,
      filename: filenameOf(db, input.zetelId, row),
    });
    if (hits.length >= limit) break;
  }
  logger.info('passages retrieved', { zetelId: input.zetelId, count: hits.length });
  return hits;
}
