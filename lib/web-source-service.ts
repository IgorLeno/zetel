import type Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { escapeMarkdownText, htmlToMarkdown } from './html-to-markdown';
import { addFile, assertZetelAtivo } from './ingestao-service';
import { logger } from './logger';
import { safeFetch, WebFetchError, type SafeFetchOptions, type SafeFetchResult, type WebFetchErrorCode } from './web-fetch';
import { slugify } from './zetel-service';
import type { ZetelFile } from '@/types/zetel-file';

/**
 * Importação de fontes da web para `arquivos/` (SPEC-012 RF1–RF4, tarefa 001).
 *
 * URL → `safeFetch` (RNF1) → snapshot `.md` com frontmatter de proveniência
 * (HTML/texto) ou o PDF original → `addFile` com as colunas de proveniência no
 * mesmo INSERT. Depois disso o pipeline atual (Processar, Documento Técnico,
 * Guia) segue sem mudança: o frontmatter é removido na segmentação.
 *
 * Regra #3: o conteúdo autoritativo é o que este servidor baixou e gravou.
 * Regra #6: logs só com IDs, contagens e categoria; nunca URL, site ou título.
 */

/** Abaixo disso, a página provavelmente é SPA sem SSR ou só navegação. */
export const MIN_TEXT_CHARS = 200;
const MAX_TITLE_CHARS = 300;

export type WebSourceErrorCode = WebFetchErrorCode | 'no_text' | 'store';

export class WebSourceError extends Error {
  readonly code: WebSourceErrorCode;
  constructor(code: WebSourceErrorCode, message: string) {
    super(message);
    this.name = 'WebSourceError';
    this.code = code;
  }
}

export interface WebImportResult {
  file: ZetelFile;
  extraction: 'full' | 'pdf';
}

function siteOf(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

function cleanTitle(raw: string): string {
  // C0/C1, separadores de linha Unicode e BOM: inválidos ou ambíguos em YAML.
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_CHARS);
}

/** `slugify` cai em 'zetel' quando não sobra nada; aqui o fallback é o site. */
function fileSlug(title: string, site: string): string {
  const latin = title.normalize('NFD').replace(/\p{Mn}/gu, '');
  return slugify(/[a-z0-9]/i.test(latin) ? title : site);
}

function lastPathSegment(url: URL): string {
  try {
    return decodeURIComponent(posix.basename(url.pathname));
  } catch {
    return posix.basename(url.pathname);
  }
}

function decodeText(body: Buffer, charset: string | null, sniffHtml: boolean): string {
  let cs = charset;
  if (!cs && sniffHtml) {
    const m = body.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i);
    if (m) cs = m[1]!.toLowerCase();
  }
  try {
    return new TextDecoder(cs ?? 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

function frontmatter(url: URL, title: string, accessedAt: string): string {
  // JSON.stringify gera strings YAML double-quoted válidas (escapa aspas e \).
  return [
    '---',
    `source_url: ${JSON.stringify(url.href)}`,
    `source_title: ${JSON.stringify(title)}`,
    `source_site: ${JSON.stringify(siteOf(url))}`,
    `accessed_at: ${JSON.stringify(accessedAt)}`,
    'extraction: full',
    '---',
    '',
  ].join('\n');
}

interface Snapshot {
  title: string;
  body: string;
  textLength: number;
}

function toSnapshot(res: SafeFetchResult): Snapshot {
  const fallbackTitle = lastPathSegment(res.url) || siteOf(res.url);
  if (res.kind === 'html') {
    const r = htmlToMarkdown(decodeText(res.body, res.charset, true));
    const title = cleanTitle(r.title) || siteOf(res.url);
    // Evita H1 duplicado quando a página repete o <title> no primeiro <h1>.
    const ownH1 = `# ${escapeMarkdownText(title)}\n`;
    const body = r.markdown.startsWith(ownH1) ? r.markdown.slice(ownH1.length).replace(/^\n+/, '') : r.markdown;
    return { title, body, textLength: r.textLength };
  }
  const text = decodeText(res.body, res.charset, false).replace(/\r\n?/g, '\n');
  const textLength = text.replace(/\s+/g, ' ').trim().length;
  // text/markdown também entra como texto escapado: Markdown remoto traria
  // imagens e HTML ativos para o vault (o Obsidian carrega imagem remota).
  // O frontmatter da própria fonte é descartado.
  const source = res.kind === 'markdown' ? text.replace(/^---\n[\s\S]*?\n---\n/, '') : text;
  const body = source
    .split('\n')
    .map((line) => escapeMarkdownText(line.trimEnd()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: cleanTitle(fallbackTitle), body: body ? `${body}\n` : '', textLength };
}

function fail(zetelId: string, code: WebSourceErrorCode, message: string): never {
  logger.warn('web source failed', { zetelId, category: code });
  throw new WebSourceError(code, message);
}

/**
 * Baixa `input.url` com segurança e anexa o resultado ao Zetel. Lança
 * `WebSourceError` com mensagem genérica (sem URL) e categoria para log.
 */
export async function importWebSource(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  input: { url: string },
  fetchOptions?: SafeFetchOptions,
): Promise<WebImportResult> {
  assertZetelAtivo(db, zetelId);

  let res: SafeFetchResult;
  try {
    res = await safeFetch(input.url, fetchOptions);
  } catch (err) {
    if (err instanceof WebFetchError) fail(zetelId, err.code, err.message);
    fail(zetelId, 'network', new WebFetchError('network').message);
  }

  const accessedAt = new Date().toISOString();
  const site = siteOf(res.url);
  let filename: string;
  let content: Buffer | string;
  let title: string;

  if (res.kind === 'pdf') {
    title = cleanTitle(lastPathSegment(res.url)) || site;
    filename = `web-${fileSlug(title.replace(/\.pdf$/i, ''), site)}.pdf`;
    content = res.body;
  } else {
    const snap = toSnapshot(res);
    if (snap.textLength < MIN_TEXT_CHARS || !snap.body) {
      fail(zetelId, 'no_text', 'Sem texto extraível nesta página.');
    }
    title = snap.title;
    filename = `web-${fileSlug(title, site)}.md`;
    content = `${frontmatter(res.url, title, accessedAt)}# ${escapeMarkdownText(title)}\n\n${snap.body}`;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'zetel-web-'));
  let file: ZetelFile;
  try {
    const path = join(tmp, filename);
    try {
      writeFileSync(path, content);
    } catch {
      // O erro de fs traz o caminho (derivado do título) — não propagamos.
      fail(zetelId, 'store', 'Falha ao preparar o arquivo importado.');
    }
    try {
      file = addFile(db, vaultPath, zetelId, path, { url: res.url.href, title, accessedAt });
    } catch (err) {
      // addFile só lança mensagens genéricas (regra #6), seguras para a UI.
      fail(zetelId, 'store', (err as Error).message);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const extraction = res.kind === 'pdf' ? 'pdf' : 'full';
  logger.info('web source imported', { zetelId, fileId: file.id, kind: extraction, bytes: res.body.length });
  return { file, extraction };
}
