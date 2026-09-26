import { createHash } from 'node:crypto';
import { extname } from 'node:path';

/**
 * Extração server-side de PDF (SPEC-001 D1–D2, tarefa 002). Função pura sobre
 * bytes: sem banco, sem vault, sem LLM. A persistência em `pdf_pages` /
 * `pdf_sections` vive em `lib/ingestao-service.ts` (`processPdfFiles`).
 *
 * Segurança: o PDF é entrada não confiável. Só lemos texto e outline; nada do
 * documento é executado — sem scripting/JavaScript (pdf.js só executa JS no
 * viewer com sandbox, que não usamos), sem XFA, sem anotações, sem FontFace e
 * sem fetch de recursos externos. `isEvalSupported` não existe mais no pdf.js 6
 * (o caminho de `new Function` para fontes foi removido), por isso não aparece.
 * Como a extração roda no event loop do servidor, `PDF_EXTRACTION_LIMITS`
 * limita páginas, texto total e tempo; estourar qualquer limite é `failed`.
 */

/** Limite de upload por PDF (documentado em `.agent/ARCHITECTURE.md`). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export const PDF_TOO_LARGE_MESSAGE = `O PDF excede o limite de ${MAX_PDF_BYTES / (1024 * 1024)} MB.`;

export interface PdfExtractionLimits {
  maxPages: number;
  /** Soma de `char_count` de todas as páginas. */
  maxTotalChars: number;
  /** Orçamento de relógio, verificado entre páginas. */
  timeoutMs: number;
}

export const PDF_EXTRACTION_LIMITS: PdfExtractionLimits = {
  maxPages: 5000,
  maxTotalChars: 20_000_000,
  timeoutMs: 120_000,
};

/** Estouro de limite de extração; `name` estável para logs (Regra #6). */
export class PdfLimitError extends Error {
  constructor(limit: keyof PdfExtractionLimits) {
    super(`Limite de extração de PDF excedido: ${limit}.`);
    this.name = 'PdfLimitError';
  }
}

/** Limites defensivos contra outlines hostis (profundidade/quantidade). */
const MAX_OUTLINE_DEPTH = 16;
const MAX_OUTLINE_ITEMS = 5000;
const MAX_SECTION_TITLE_CHARS = 500;

export type ExtractionStatus = 'ok' | 'no_text' | 'failed';

export interface PdfPageText {
  /** 1-based, como no PDF. */
  pageNumber: number;
  contentText: string;
  contentHash: string;
  charCount: number;
}

export interface PdfSection {
  ord: number;
  title: string;
  level: number;
  startPage: number;
  endPage: number;
}

export interface PdfExtraction {
  status: Exclude<ExtractionStatus, 'failed'>;
  pageCount: number;
  pages: PdfPageText[];
  sections: PdfSection[];
}

export function isPdfFilename(name: string): boolean {
  return extname(name).toLowerCase() === '.pdf';
}

/** Cabeçalho `%PDF-` nos primeiros 1024 bytes (mesma tolerância do pdf.js). */
export function looksLikePdf(head: Uint8Array): boolean {
  return Buffer.from(head.subarray(0, 1024)).includes('%PDF-', 0, 'latin1');
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Controles C0 (exceto \t \n) e DEL; mantidos fora do texto derivado.
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * Normalização determinística do texto de uma página: NFC, sem controles,
 * espaços colapsados por linha, sem linhas vazias nas bordas.
 */
export function normalizePageText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim() : '';
  // Corta por code point para não partir pares substitutos.
  return Array.from(title).slice(0, MAX_SECTION_TITLE_CHARS).join('') || '[sem título]';
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
type OutlineNode = Awaited<ReturnType<PdfDocument['getOutline']>>[number];

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Import tardio: o build legacy de pdf.js só carrega quando há PDF a extrair. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').catch((err: unknown) => {
    pdfjsPromise = null; // falha transitória não fica cacheada até o restart
    throw err;
  });
  return pdfjsPromise;
}

async function resolveDestPage(doc: PdfDocument, dest: OutlineNode['dest']): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target = explicit[0] as unknown;
    if (typeof target === 'number' && Number.isInteger(target)) return target + 1;
    if (target && typeof target === 'object' && 'num' in target && 'gen' in target) {
      return (await doc.getPageIndex(target as { num: number; gen: number })) + 1;
    }
  } catch {
    // Destino inválido/ausente: a seção é ignorada, sem derrubar a extração.
  }
  return null;
}

async function extractSections(doc: PdfDocument, pageCount: number): Promise<PdfSection[]> {
  const outline = await doc.getOutline();
  if (!outline?.length) return [];

  // Percurso em pré-ordem com pilha explícita (sem recursão ilimitada).
  const flat: { title: string; level: number; startPage: number }[] = [];
  const stack: { node: OutlineNode; level: number }[] = outline
    .map((node) => ({ node, level: 1 }))
    .reverse();
  let visited = 0;
  while (stack.length > 0 && visited < MAX_OUTLINE_ITEMS) {
    const { node, level } = stack.pop()!;
    visited++;
    const page = await resolveDestPage(doc, node.dest);
    if (page !== null && page >= 1 && page <= pageCount) {
      flat.push({ title: cleanTitle(node.title), level, startPage: page });
    }
    if (level < MAX_OUTLINE_DEPTH && node.items?.length) {
      for (let i = node.items.length - 1; i >= 0; i--) {
        stack.push({ node: node.items[i]!, level: level + 1 });
      }
    }
  }

  // Fim da seção: página anterior à próxima seção de nível igual ou superior.
  return flat.map((s, i) => {
    const next = flat.slice(i + 1).find((o) => o.level <= s.level);
    const endPage = next ? Math.max(s.startPage, next.startPage - 1) : pageCount;
    return { ord: i, title: s.title, level: s.level, startPage: s.startPage, endPage };
  });
}

/**
 * Extrai texto por página (1-based, com sha256 e contagem de caracteres) e o
 * outline. PDF sem nenhum texto retorna `no_text`. Lança em PDF inválido,
 * corrompido ou protegido por senha — quem chama registra `failed`.
 */
export async function extractPdf(
  data: Uint8Array,
  limits: PdfExtractionLimits = PDF_EXTRACTION_LIMITS,
): Promise<PdfExtraction> {
  const deadline = Date.now() + limits.timeoutMs;
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    // Cópia: pdf.js pode transferir (detach) o buffer para o worker.
    data: new Uint8Array(data),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    // Erros recuperáveis de operador/fonte não derrubam o documento inteiro;
    // PDF estruturalmente inválido ainda rejeita em `task.promise`.
    stopAtErrors: false,
  });

  try {
    const doc = await task.promise;
    const pageCount = doc.numPages;
    if (pageCount > limits.maxPages) throw new PdfLimitError('maxPages');
    const pages: PdfPageText[] = [];
    let totalChars = 0;
    for (let n = 1; n <= pageCount; n++) {
      if (Date.now() >= deadline) throw new PdfLimitError('timeoutMs');
      const page = await doc.getPage(n);
      const content = await page.getTextContent({ includeMarkedContent: false });
      let raw = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        raw += item.str;
        if (item.hasEOL) raw += '\n';
      }
      page.cleanup();
      const contentText = normalizePageText(raw);
      totalChars += contentText.length;
      if (totalChars > limits.maxTotalChars) throw new PdfLimitError('maxTotalChars');
      pages.push({
        pageNumber: n,
        contentText,
        contentHash: sha256(contentText),
        charCount: contentText.length,
      });
    }

    const sections = await extractSections(doc, pageCount);
    const status = pages.some((p) => p.charCount > 0) ? 'ok' : 'no_text';
    return { status, pageCount, pages, sections };
  } finally {
    await task.destroy();
  }
}
