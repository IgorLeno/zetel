import { NextResponse } from 'next/server';
import { getOpenRouterModel, resolveOpenRouterCredential } from '@/lib/config';
import { getDb } from '@/lib/db';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';
import { getSetting } from '@/lib/settings';
import {
  QUERY_MAX_CHARS,
  QUERY_MIN_CHARS,
  cacheSearch,
  readTrustedDomains,
  reserveDailySearch,
  searchWeb,
  WebSearchError,
} from '@/lib/web-search-service';

export const runtime = 'nodejs'; // better-sqlite3 e cache em processo

const BAD_BODY = `Escreva um tema de ${QUERY_MIN_CHARS} a ${QUERY_MAX_CHARS} caracteres.`;
const NO_KEY = 'Chave OpenRouter não configurada. Configure-a em Configurações para pesquisar na web.';

type Ctx = { params: Promise<{ id: string }> };

function parseBody(body: unknown): { query: string; openWeb: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const { query, openWeb } = body as { query?: unknown; openWeb?: unknown };
  if (typeof query !== 'string' || typeof openWeb !== 'boolean') return null;
  const q = query.replace(/\s+/g, ' ').trim();
  if (q.length < QUERY_MIN_CHARS || q.length > QUERY_MAX_CHARS) return null;
  return { query: q, openWeb };
}

/** Modelo padrão do app: `default_model` → `~/.zetel/config` (mesma base do Guia). */
function searchModel(): string {
  return getSetting('default_model')?.trim() || getOpenRouterModel();
}

/**
 * POST /api/zetels/[id]/web-sources/search — `{ query, openWeb }`.
 * Uma única chamada ao OpenRouter (plugin `web`, engine `exa`) por pedido,
 * sob o teto diário (SPEC-012 RF5/RF8). As candidatas ficam só no cache em
 * processo; nada é persistido nem baixado aqui (RF9). Logs e erros nunca
 * contêm tema, URL, título ou trecho (regra #6).
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }

  try {
    assertZetelAtivo(getDb(), id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Sem chave não há custo: responde antes de consumir o teto.
  const credential = resolveOpenRouterCredential();
  if (!credential.key) {
    return NextResponse.json({ error: NO_KEY }, { status: 503 });
  }

  const budget = reserveDailySearch();
  if (!budget.ok) {
    logger.warn('web search refused', { zetelId: id, category: 'daily_limit', limit: budget.limit });
    return NextResponse.json(
      {
        error: `Limite diário de ${budget.limit} buscas na web atingido. Tente amanhã ou adicione fontes por link.`,
      },
      { status: 429 },
    );
  }

  const trustedDomains = readTrustedDomains();
  try {
    const drafts = await searchWeb({
      apiKey: credential.key,
      model: searchModel(),
      query: body.query,
      includeDomains: body.openWeb ? null : trustedDomains,
      trustedDomains,
    });
    const { searchId, candidates } = cacheSearch(id, drafts);
    logger.info('web search done', {
      zetelId: id,
      openWeb: body.openWeb ? 1 : 0,
      count: candidates.length,
      trusted: candidates.filter((c) => c.trusted).length,
      dailyCount: budget.count,
    });
    return NextResponse.json({ searchId, candidates });
  } catch (err) {
    if (err instanceof WebSearchError) {
      logger.warn('web search failed', { zetelId: id, category: err.code, status: err.status ?? 0 });
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    logger.error('web search crashed', { zetelId: id });
    return NextResponse.json({ error: 'Falha ao pesquisar na web.' }, { status: 502 });
  }
}
