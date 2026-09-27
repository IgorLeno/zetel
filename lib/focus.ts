import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import type { FocusState } from '@/types/study-session';
import { zetelArquivosDir } from './paths';
import { isPdfFilename } from './pdf-service';

/**
 * Foco de leitura do chat (SPEC-001 D4, tarefa 003: escopo `page` de PDF).
 * O cliente informa só `fileId` + `pageNumber`; posse, texto e hash vêm
 * sempre do servidor (`zetel_files` / `pdf_pages`).
 */

export interface PdfPageFocusInput {
  fileId: string;
  pageNumber: number;
  /** Seleção do cliente (tarefa 004): só candidata; vale apenas após `verifyPdfSelection`. */
  selectionText?: string;
}

/** Teto da seleção enviada pelo cliente e do recorte usado no prompt (PLAN: ≤ 2000). */
export const SELECTION_MAX_CHARS = 2000;

/** Recorte verificado: texto e offsets vêm de `pdf_pages.content_text`, nunca do cliente. */
export interface VerifiedSelection {
  text: string;
  start: number;
  end: number;
  hash: string;
}

export interface ResolvedPdfPageFocus {
  fileId: string;
  filename: string;
  pageNumber: number;
  pageCount: number | null;
  contentText: string;
  contentHash: string;
}

export interface ResolvedPdfFile {
  fileId: string;
  filename: string;
  path: string;
  sizeBytes: number;
}

const FILE_ID_MAX = 120;

/**
 * Valida a forma do `focus` enviado pelo cliente. Retorna `null` quando ausente,
 * `'invalid'` quando presente mas malformado. Qualquer campo extra (ex.: texto
 * da página) é ignorado por construção; `selectionText` só é repassado para
 * verificação contra `pdf_pages` (tarefa 004).
 */
export function parsePdfPageFocus(raw: unknown): PdfPageFocusInput | null | 'invalid' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'invalid';
  const { fileId, pageNumber, selectionText } = raw as {
    fileId?: unknown;
    pageNumber?: unknown;
    selectionText?: unknown;
  };
  if (typeof fileId !== 'string' || !fileId.trim() || fileId.length > FILE_ID_MAX) {
    return 'invalid';
  }
  if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return 'invalid';
  }
  if (selectionText !== undefined && selectionText !== null && typeof selectionText !== 'string') {
    return 'invalid';
  }
  return typeof selectionText === 'string'
    ? { fileId: fileId.trim(), pageNumber, selectionText }
    : { fileId: fileId.trim(), pageNumber };
}

const WHITESPACE = /\s/;
const HYPHENS = new Set(['-', '\u2010']);

/**
 * Forma de comparação (D5): ignora espaços e quebras, soft hyphen e o hífen de
 * fim de linha (`entro-\npia` ≡ `entropia`). A tolerância a espaços é segura
 * porque o texto usado no turno é sempre o recorte do servidor. `map[i]` é o
 * índice em `text` do i-ésimo caractere normalizado.
 */
function comparisonForm(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (WHITESPACE.test(ch) || ch === '\u00AD') continue;
    if (HYPHENS.has(ch)) {
      let j = i + 1;
      let sawNewline = false;
      while (j < text.length && WHITESPACE.test(text[j])) {
        if (text[j] === '\n' || text[j] === '\r') sawNewline = true;
        j++;
      }
      if (sawNewline) continue;
    }
    norm += ch;
    map.push(i);
  }
  return { norm, map };
}

/**
 * Verifica a seleção do cliente contra o texto server-side da página (D5).
 * Retorna o recorte do PRÓPRIO servidor (primeira ocorrência) com offsets e
 * hash, ou `null` quando vazia, acima do teto ou não encontrada.
 */
export function verifyPdfSelection(
  pageText: string,
  selectionText: string,
): VerifiedSelection | null {
  if (selectionText.length > SELECTION_MAX_CHARS) return null;
  const needle = comparisonForm(selectionText.normalize('NFC')).norm;
  if (!needle) return null;
  const hay = comparisonForm(pageText);
  const idx = hay.norm.indexOf(needle);
  if (idx === -1) return null;
  const start = hay.map[idx];
  const end = hay.map[idx + needle.length - 1] + 1;
  const text = pageText.slice(start, end);
  return { text, start, end, hash: createHash('sha256').update(text).digest('hex') };
}

interface PdfFileRow {
  id: string;
  filename: string;
  page_count: number | null;
}

function findOwnedPdfRow(
  db: Database.Database,
  zetelId: string,
  fileId: string,
): PdfFileRow | null {
  const row = db
    .prepare(
      `SELECT f.id, f.filename, f.page_count
         FROM zetel_files f
         JOIN zetels z ON z.id = f.zetel_id
        WHERE f.id = ? AND f.zetel_id = ? AND z.trashed_at IS NULL`,
    )
    .get(fileId, zetelId) as PdfFileRow | undefined;
  if (!row || !isPdfFilename(row.filename)) return null;
  return row;
}

/**
 * Página PDF do foco, lida de `pdf_pages`. `null` quando o arquivo não pertence
 * ao Zetel, não é PDF ou a página não foi extraída.
 */
export function resolvePdfPageFocus(
  db: Database.Database,
  zetelId: string,
  focus: PdfPageFocusInput,
): ResolvedPdfPageFocus | null {
  const file = findOwnedPdfRow(db, zetelId, focus.fileId);
  if (!file) return null;
  const page = db
    .prepare(
      `SELECT content_text, content_hash FROM pdf_pages
        WHERE file_id = ? AND page_number = ?`,
    )
    .get(file.id, focus.pageNumber) as
    | { content_text: string; content_hash: string }
    | undefined;
  if (!page) return null;
  return {
    fileId: file.id,
    filename: file.filename,
    pageNumber: focus.pageNumber,
    pageCount: file.page_count,
    contentText: page.content_text,
    contentHash: page.content_hash,
  };
}

/**
 * Caminho do PDF original registrado no Zetel. O caminho é montado só a partir
 * do `filename` gravado no banco e precisa continuar dentro de `arquivos/`
 * (defesa contra traversal mesmo com linha adulterada). `null` = não servir.
 */
export function resolvePdfFile(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  fileId: string,
): ResolvedPdfFile | null {
  const slugRow = db
    .prepare('SELECT slug FROM zetels WHERE id = ? AND trashed_at IS NULL')
    .get(zetelId) as { slug: string } | undefined;
  if (!slugRow) return null;
  const file = findOwnedPdfRow(db, zetelId, fileId);
  if (!file) return null;

  const dir = resolve(zetelArquivosDir(vaultPath, slugRow.slug));
  const path = resolve(dir, file.filename);
  if (!path.startsWith(dir + sep)) return null;

  let size: number;
  let realPath: string;
  try {
    // realpath: um symlink dentro de arquivos/ não pode apontar para fora dele.
    realPath = realpathSync(path);
    if (!realPath.startsWith(realpathSync(dir) + sep)) return null;
    const st = statSync(realPath);
    if (!st.isFile()) return null;
    size = st.size;
  } catch {
    return null;
  }
  return { fileId: file.id, filename: file.filename, path: realPath, sizeBytes: size };
}

export interface FocusCommand {
  onlyThisPage: boolean;
  scope: 'section' | 'document' | null;
  hint: 'beginning' | 'end' | null;
}

const EMPTY_COMMAND: FocusCommand = { onlyThisPage: false, scope: null, hint: null };

function foldFocusText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Regras PT-BR fechadas do PLAN. Não é um parser de intenção: só estes
 * enunciados mudam o foco. Vários matches: página vence seção, seção vence
 * documento; o hint de começo/fim é independente, exceto em "só dessa página".
 */
export function parseFocusCommand(message: string): FocusCommand {
  const text = foldFocusText(message);
  const onlyThisPage = /\bso dessa pagina\b/.test(text);
  const section = /\b(?:capitulo|secao) inteir[oa]\b/.test(text);
  const document = /\b(?:documento|livro|artigo) inteir[oa]\b/.test(text);
  let hint: FocusCommand['hint'] = null;
  if (/\b(?:comeco|primeira parte)\b/.test(text)) hint = 'beginning';
  else if (/\b(?:final|ultima parte)\b/.test(text)) hint = 'end';
  if (onlyThisPage) return { onlyThisPage: true, scope: null, hint: null };
  if (section) return { onlyThisPage: false, scope: 'section', hint };
  if (document) return { onlyThisPage: false, scope: 'document', hint };
  if (hint) return { onlyThisPage: false, scope: null, hint };
  return EMPTY_COMMAND;
}

function withHint(focus: FocusState, hint: FocusCommand['hint']): FocusState {
  const base: FocusState = {
    scope: focus.scope,
    fileId: focus.fileId,
    pageNumber: focus.pageNumber,
  };
  if (hint === 'beginning' || hint === 'end') return { ...base, hint };
  return base;
}

/**
 * Próximo `FocusState` da sessão. A página visível no leitor atualiza
 * `page`/`section`; documento e Zetel permanecem até um comando ou uma
 * troca explícita de página na UI (essa troca manda `scope: page`).
 */
export function nextSessionFocus(input: {
  current: FocusState | null;
  command: FocusCommand;
  pdf: { fileId: string; pageNumber: number } | null;
  markdownPage: number | null;
}): FocusState {
  const { current, command, pdf, markdownPage } = input;
  if (command.onlyThisPage) {
    if (pdf) return { scope: 'page', fileId: pdf.fileId, pageNumber: pdf.pageNumber };
    if (markdownPage !== null) return { scope: 'page', fileId: null, pageNumber: markdownPage };
  }
  if (command.scope === 'section' && pdf) {
    return withHint(
      { scope: 'section', fileId: pdf.fileId, pageNumber: pdf.pageNumber },
      command.hint,
    );
  }
  if (command.scope === 'document') {
    const fileId = pdf?.fileId ?? current?.fileId ?? null;
    if (fileId) return withHint({ scope: 'document', fileId, pageNumber: null }, command.hint);
  }
  if (command.hint && current?.scope === 'document' && current.fileId) {
    return { scope: 'document', fileId: current.fileId, pageNumber: null, hint: command.hint };
  }
  if (command.hint && current?.scope === 'zetel') {
    return { scope: 'zetel', fileId: null, pageNumber: null, hint: command.hint };
  }
  if (command.hint && pdf) {
    const scope = current?.scope === 'section' && current.fileId === pdf.fileId ? 'section' : 'page';
    return { scope, fileId: pdf.fileId, pageNumber: pdf.pageNumber, hint: command.hint };
  }
  if (current?.scope === 'document' && current.fileId) {
    return withHint({ scope: 'document', fileId: current.fileId, pageNumber: null }, current.hint ?? null);
  }
  if (current?.scope === 'zetel') {
    return withHint({ scope: 'zetel', fileId: null, pageNumber: null }, current.hint ?? null);
  }
  if (current?.scope === 'section' && pdf && current.fileId === pdf.fileId) {
    return withHint(
      { scope: 'section', fileId: pdf.fileId, pageNumber: pdf.pageNumber },
      current.hint ?? null,
    );
  }
  if (pdf) {
    return withHint(
      { scope: 'page', fileId: pdf.fileId, pageNumber: pdf.pageNumber },
      current?.hint ?? null,
    );
  }
  if (markdownPage !== null) return { scope: 'page', fileId: null, pageNumber: markdownPage };
  return current ?? { scope: 'zetel', fileId: null, pageNumber: null };
}
