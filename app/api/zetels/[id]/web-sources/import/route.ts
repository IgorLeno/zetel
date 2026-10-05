import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';
import { getSetting } from '@/lib/settings';
import { importWebSource, WebSourceError, type WebImportResult } from '@/lib/web-source-service';

export const runtime = 'nodejs'; // node:http/https, dns, fs e better-sqlite3

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';
const BAD_BODY = 'Envie de 1 a 5 links (http ou https).';
const MAX_URLS = 5;
const MAX_URL_CHARS = 2048;

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

/**
 * POST /api/zetels/[id]/web-sources/import — `{ urls: string[] }` (1–5).
 * Baixa cada URL no servidor (SPEC-012 RF1) e devolve um resultado por URL.
 * Mensagens de erro e logs nunca ecoam URL, site ou título (regra #6).
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
  const urls = parseUrls(body);
  if (!urls) {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }

  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Sequencial: cada download tem seu próprio timeout e a ordem dos arquivos
  // segue a ordem dos links.
  const results: ImportResult[] = [];
  for (const url of urls) {
    try {
      results.push({ status: 'ok', ...(await importWebSource(db, vaultPath, id, { url })) });
    } catch (err) {
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
