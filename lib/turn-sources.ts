import type Database from 'better-sqlite3';
import type { CitedSource } from '@/types/chat-message';
import type { FocusState } from '@/types/study-session';
import type { SourceBlockInput } from './chat-prompt';
import type { ResolvedPdfPageFocus, VerifiedSelection } from './focus';
import { retrievePassages } from './retrieval-service';

export interface TurnSources {
  promptSources: SourceBlockInput[];
  sourceMap: Record<string, CitedSource>;
}

function sectionRange(
  db: Database.Database,
  fileId: string,
  pageNumber: number,
): { start: number; end: number } | null {
  const row = db.prepare(
    `SELECT start_page, end_page FROM pdf_sections
      WHERE file_id = ? AND start_page <= ? AND end_page >= ?
      ORDER BY (end_page - start_page) ASC, level DESC
      LIMIT 1`,
  ).get(fileId, pageNumber, pageNumber) as { start_page: number; end_page: number } | undefined;
  if (!row) return null;
  return { start: row.start_page, end: row.end_page };
}

/**
 * Fontes do turno: seleção, página em foco e até 4 trechos recuperados.
 * IDs estáveis neste turno. O mapa público não carrega o texto.
 */
export function collectTurnSources(
  db: Database.Database,
  input: {
    zetelId: string;
    userMessage: string;
    pdfFocus: ResolvedPdfPageFocus;
    selection: VerifiedSelection | null;
    focus: FocusState;
    allowRetrieval: boolean;
  },
): TurnSources {
  const promptSources: SourceBlockInput[] = [];
  const sourceMap: Record<string, CitedSource> = {};
  let next = 1;
  const push = (
    tipo: CitedSource['type'],
    text: string,
    pageNumber: number,
    fileId: string,
    filename: string,
  ) => {
    const id = `S${next}`;
    next += 1;
    promptSources.push({ id, doc: filename, pagina: pageNumber, tipo, text });
    sourceMap[id] = { fileId, filename, pageNumber, type: tipo };
  };

  if (input.selection) {
    push(
      'selecao',
      input.selection.text,
      input.pdfFocus.pageNumber,
      input.pdfFocus.fileId,
      input.pdfFocus.filename,
    );
  }
  push(
    'foco',
    input.pdfFocus.contentText,
    input.pdfFocus.pageNumber,
    input.pdfFocus.fileId,
    input.pdfFocus.filename,
  );

  if (!input.allowRetrieval) return { promptSources, sourceMap };

  const range = input.focus.scope === 'section'
    ? sectionRange(db, input.pdfFocus.fileId, input.pdfFocus.pageNumber)
    : null;
  const hits = retrievePassages(db, {
    zetelId: input.zetelId,
    query: input.userMessage,
    focusText: input.selection?.text ?? input.pdfFocus.contentText,
    exclude: { fileId: input.pdfFocus.fileId, pageNumber: input.pdfFocus.pageNumber },
    fileId: input.focus.scope === 'zetel' ? null : input.pdfFocus.fileId,
    hint: input.focus.hint ?? null,
    pageMin: range?.start ?? null,
    pageMax: range?.end ?? null,
  });
  for (const hit of hits) {
    if (hit.sourceKind !== 'pdf' || !hit.fileId) continue;
    push('recuperado', hit.text, hit.pageNumber, hit.fileId, hit.filename);
  }
  return { promptSources, sourceMap };
}
