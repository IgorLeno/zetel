import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';
import { getSetting } from '@/lib/settings';
import {
  importWebExcerpt,
  importWebSource,
  WebSourceError,
  type WebImportResult,
  type WebSourceErrorCode,
} from '@/lib/web-source-service';
import { getCachedSearch, MAX_IMPORT_CANDIDATES, type SearchCandidate } from '@/lib/web-search-service';

export const runtime = 'nodejs'; // node:http/https, dns, fs e better-sqlite3

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';
const BAD_BODY = 'Envie de 1 a 5 links (http ou https).';
const BAD_CANDIDATES = `Escolha de 1 a ${MAX_IMPORT_CANDIDATES} fontes da busca.`;
const SEARCH_EXPIRED = 'Esta busca expirou. Pesquise de novo para importar.';
const UNKNOWN_CANDIDATE = 'Fonte não encontrada nesta busca.';
const MAX_URLS = 5;
const MAX_URL_CHARS = 2048;
const MAX_ID_CHARS = 64;

/**
 * Falhas de download/extração que o trecho pode cobrir (RF6). Fora daqui:
 * `blocked_host`/`invalid_url` (recusa de segurança — gravar o trecho
 * esconderia um endereço não público) e `store` (outro conteúdo não ajuda).
 */
const EXCERPT_FALLBACK: ReadonlySet<WebSourceErrorCode> = new Set([
  'dns',
  'timeout',
  'too_large',
  'bad_type',
  'not_public',
  'http_status',
  'too_many_redirects',
  'network',
  'no_text',
]);

type Ctx = { params: Promise<{ id: string }> };

type ImportResult =
  | ({ status: 'ok' } & WebImportResult)
  | { status: 'error'; message: string };

function parseUrls(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null;
  const urls = (body as { urls?: unknown }).urls;
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_URLS) return null;
  if (!urls.every((u) => typeof u === 'string' && u.trim() && u.length <= MAX_URL_CHARS)) return null;
  return urls.map((u: string) => u.trim());
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_CHARS;
}

/** Variante da busca (RF6): só ids; URL e trecho vêm do cache do servidor. */
function parseCandidates(body: unknown): { searchId: string; candidateIds: string[]; allowExcerpt: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const { searchId, candidateIds, allowExcerpt } = body as Record<string, unknown>;
  if (!isId(searchId) || typeof allowExcerpt !== 'boolean') return null;
  if (!Array.isArray(candidateIds) || candidateIds.length < 1 || candidateIds.length > MAX_IMPORT_CANDIDATES) {
    return null;
  }
  if (!candidateIds.every(isId) || new Set(candidateIds).size !== candidateIds.length) return null;
  return { searchId, candidateIds, allowExcerpt };
}

/**
 * POST /api/zetels/[id]/web-sources/import
 * - `{ urls: string[] }` (1–5): baixa cada URL no servidor (SPEC-012 RF1).
 * - `{ searchId, candidateIds, allowExcerpt }`: importa candidatas de uma busca
 *   (RF6). URL e trecho saem do cache em processo, nunca do cliente (regra #3);
 *   busca desconhecida/expirada responde 404. Com `allowExcerpt`, falha no
 *   download grava o trecho da busca (`extraction: excerpt`).
 * Devolve um resultado por item. Erros e logs nunca ecoam URL, site ou título
 * (regra #6).
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }
  const fromSearch = body && typeof body === 'object' && 'searchId' in body;
  const urls = fromSearch ? null : parseUrls(body);
  const picked = fromSearch ? parseCandidates(body) : null;
  if (!urls && !picked) {
    return NextResponse.json({ error: fromSearch ? BAD_CANDIDATES : BAD_BODY }, { status: 400 });
  }

  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  let cached: SearchCandidate[] | null = null;
  if (picked) {
    cached = getCachedSearch(id, picked.searchId);
    if (!cached) {
      logger.warn('web source import refused', { zetelId: id, category: 'search_expired' });
      return NextResponse.json({ error: SEARCH_EXPIRED }, { status: 404 });
    }
  }

  // Sequencial: cada download tem seu próprio timeout e a ordem dos arquivos
  // segue a ordem pedida.
  const results: ImportResult[] = [];
  const items = urls ?? picked!.candidateIds;
  for (const item of items) {
    const candidate = cached ? cached.find((c) => c.id === item) : null;
    if (cached && !candidate) {
      results.push({ status: 'error', message: UNKNOWN_CANDIDATE });
      continue;
    }
    const url = candidate ? candidate.url : item;
    try {
      results.push({ status: 'ok', ...(await importWebSource(db, vaultPath, id, { url })) });
    } catch (err) {
      if (candidate && picked!.allowExcerpt && err instanceof WebSourceError && EXCERPT_FALLBACK.has(err.code)) {
        try {
          results.push({ status: 'ok', ...importWebExcerpt(db, vaultPath, id, candidate) });
          continue;
        } catch (excerptErr) {
          err = excerptErr;
        }
      }
      if (err instanceof WebSourceError) {
        results.push({ status: 'error', message: err.message });
      } else {
        logger.error('web source import crashed', { zetelId: id });
        results.push({ status: 'error', message: 'Falha ao importar a fonte.' });
      }
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  logger.info('web sources import done', { zetelId: id, ok, failed: results.length - ok });
  return NextResponse.json({ results });
}
