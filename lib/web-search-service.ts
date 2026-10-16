import { randomBytes } from 'node:crypto';
import { openRouterHttpError } from './openrouter';
import { getSetting, setSetting } from './settings';

/**
 * Busca de fontes na web por tema (SPEC-012 RF5–RF8, tarefa 002).
 *
 * Tema → 1 chamada ao OpenRouter com o plugin `web` (engine `exa`) → parser
 * de `message.annotations[].url_citation` → até 8 candidatas. As candidatas
 * ficam só num cache em processo, por Zetel, com TTL de 30 min: o import
 * resolve URL e trecho por ele, nunca pelo texto do cliente (regra #3), e
 * nada da busca vai para SQLite ou vault (RF9). O único estado persistido é o
 * contador diário `{date,count}` (RF8).
 *
 * Regra #6: este módulo não loga; as rotas logam só IDs, contagens e categoria.
 */

export const MAX_CANDIDATES = 8;
export const SNIPPET_MAX_CHARS = 300;
export const MAX_IMPORT_CANDIDATES = 5;
export const QUERY_MIN_CHARS = 2;
export const QUERY_MAX_CHARS = 200;
export const DEFAULT_DAILY_LIMIT = 20;
export const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
const DAILY_LIMIT_MIN = 1;
const DAILY_LIMIT_MAX = 200;
const MAX_DOMAINS = 50;
const MAX_TITLE_CHARS = 300;
/** Mesmo teto do import por link: URLs maiores são descartadas. */
const MAX_URL_CHARS = 2048;
/** Teto de buscas guardadas: o cache não cresce sem limite num processo longo. */
const MAX_CACHED_SEARCHES = 100;
const SEARCH_TIMEOUT_MS = 60_000;
/** A resposta do modelo é descartada; só as annotations interessam. */
const SEARCH_MAX_TOKENS = 400;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Lista confiável padrão (RF7). `*.x` casa subdomínios de `x`, não `x` nu. */
export const DEFAULT_TRUSTED_DOMAINS: readonly string[] = Object.freeze([
  'wikipedia.org',
  'wikibooks.org',
  'arxiv.org',
  'scielo.org',
  'scielo.br',
  '*.gov',
  '*.gov.br',
  '*.edu',
  '*.edu.br',
  'developer.mozilla.org',
  'docs.python.org',
  'nature.com',
  'ncbi.nlm.nih.gov',
  'khanacademy.org',
  'stanford.edu',
  'mit.edu',
]);

export interface SearchCandidateDraft {
  title: string;
  site: string;
  snippet: string;
  url: string;
  trusted: boolean;
}

export interface SearchCandidate extends SearchCandidateDraft {
  id: string;
}

// ---------------------------------------------------------------------------
// URL, lista confiável e parser
// ---------------------------------------------------------------------------

function siteOf(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/** Chave de dedup: ignora esquema http/https, `www.`, porta padrão, hash e barra final. */
export function normalizeUrlKey(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  return `${siteOf(url)}${url.port ? `:${url.port}` : ''}${path}${url.search}`;
}

const DOMAIN_RE = /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function isTrustedHost(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return domains.some((entry) => {
    if (entry.startsWith('*.')) return host.endsWith(entry.slice(1));
    return host === entry || host.endsWith(`.${entry}`);
  });
}

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  // C0/C1, separadores de linha Unicode e BOM viram espaço (mesmo critério do import).
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Aceita `{ url_citation: { url, title, content } }` e a forma plana `{ url, title, content }`. */
function citationOf(annotation: unknown): { url?: unknown; title?: unknown; content?: unknown } | null {
  if (!annotation || typeof annotation !== 'object') return null;
  const a = annotation as { type?: unknown; url_citation?: unknown };
  if (a.type !== undefined && a.type !== 'url_citation') return null;
  if (a.url_citation && typeof a.url_citation === 'object') return a.url_citation as Record<string, unknown>;
  return a as Record<string, unknown>;
}

/** Lê `choices[0].message.annotations`; formato inesperado vira lista vazia. */
export function parseSearchAnnotations(data: unknown, domains: readonly string[]): SearchCandidateDraft[] {
  const annotations = (data as { choices?: { message?: { annotations?: unknown } }[] } | null)?.choices?.[0]
    ?.message?.annotations;
  if (!Array.isArray(annotations)) return [];

  const seen = new Set<string>();
  const out: SearchCandidateDraft[] = [];
  for (const annotation of annotations) {
    if (out.length >= MAX_CANDIDATES) break;
    const c = citationOf(annotation);
    if (!c || typeof c.url !== 'string' || c.url.length > MAX_URL_CHARS) continue;
    const key = normalizeUrlKey(c.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const url = new URL(c.url);
    const site = siteOf(url);
    out.push({
      title: cleanText(c.title, MAX_TITLE_CHARS) || site,
      site,
      snippet: cleanText(c.content, SNIPPET_MAX_CHARS),
      url: url.href,
      trusted: isTrustedHost(url.hostname, domains),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Settings: lista confiável e teto diário
// ---------------------------------------------------------------------------

/** `web_search_domains` válido (array de 1–50 domínios) ou o padrão do RF7. */
export function readTrustedDomains(): string[] {
  const raw = getSetting('web_search_domains');
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= MAX_DOMAINS) {
        const domains = parsed.map((d) => (typeof d === 'string' ? d.trim().toLowerCase() : ''));
        if (domains.every((d) => d.length <= 253 && DOMAIN_RE.test(d))) return domains;
      }
    } catch {
      /* setting corrompido: vale o padrão */
    }
  }
  return [...DEFAULT_TRUSTED_DOMAINS];
}

export function readDailyLimit(): number {
  const raw = getSetting('web_search_daily_limit')?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= DAILY_LIMIT_MIN && n <= DAILY_LIMIT_MAX) return n;
  }
  return DEFAULT_DAILY_LIMIT;
}

/** Data local `YYYY-MM-DD`: o "dia" do teto é o dia do usuário. */
function dayKey(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function readDailyCount(date: string): number {
  try {
    const parsed = JSON.parse(getSetting('web_search_daily') ?? '') as { date?: unknown; count?: unknown };
    if (parsed?.date === date && Number.isInteger(parsed.count) && (parsed.count as number) > 0) {
      return parsed.count as number;
    }
  } catch {
    /* ausente ou corrompido: recomeça */
  }
  return 0;
}

/**
 * Reserva uma busca do teto diário antes de chamar o OpenRouter. Leitura e
 * escrita são síncronas (better-sqlite3), então dois pedidos simultâneos no
 * mesmo processo não furam o teto. A reserva não é devolvida se a chamada
 * falhar: o custo pode ter ocorrido mesmo assim.
 */
export function reserveDailySearch(now: Date = new Date()): { ok: boolean; count: number; limit: number } {
  const limit = readDailyLimit();
  const date = dayKey(now);
  const count = readDailyCount(date);
  if (count >= limit) return { ok: false, count, limit };
  setSetting('web_search_daily', JSON.stringify({ date, count: count + 1 }));
  return { ok: true, count: count + 1, limit };
}

// ---------------------------------------------------------------------------
// Cache em processo
// ---------------------------------------------------------------------------

interface CachedSearch {
  zetelId: string;
  expiresAt: number;
  candidates: SearchCandidate[];
}

// globalThis: as rotas search e import são bundles distintos no Next e
// precisam enxergar o mesmo Map (mesmo padrão de `globalThis.__zetelDb`).
const CACHE_KEY = Symbol.for('zetel.webSearchCache');
function cache(): Map<string, CachedSearch> {
  const g = globalThis as { [CACHE_KEY]?: Map<string, CachedSearch> };
  return (g[CACHE_KEY] ??= new Map());
}

function opaqueId(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function cacheSearch(
  zetelId: string,
  drafts: SearchCandidateDraft[],
  now: number = Date.now(),
): { searchId: string; candidates: SearchCandidate[] } {
  const map = cache();
  for (const [id, entry] of map) if (entry.expiresAt <= now) map.delete(id);
  // Map preserva ordem de inserção: o primeiro é o mais antigo.
  while (map.size >= MAX_CACHED_SEARCHES) map.delete(map.keys().next().value!);

  const searchId = opaqueId(18);
  const candidates = drafts.map((d) => ({ id: opaqueId(9), ...d }));
  map.set(searchId, { zetelId, expiresAt: now + SEARCH_CACHE_TTL_MS, candidates });
  return { searchId, candidates };
}

/** Candidatas da busca, ou null se desconhecida, expirada ou de outro Zetel. */
export function getCachedSearch(zetelId: string, searchId: string, now: number = Date.now()): SearchCandidate[] | null {
  const entry = cache().get(searchId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache().delete(searchId);
    return null;
  }
  return entry.zetelId === zetelId ? entry.candidates : null;
}

export function clearSearchCache(): void {
  cache().clear();
}

// ---------------------------------------------------------------------------
// Chamada ao OpenRouter
// ---------------------------------------------------------------------------

export type WebSearchErrorCode = 'timeout' | 'network' | 'http_status' | 'bad_response';

export class WebSearchError extends Error {
  readonly code: WebSearchErrorCode;
  readonly status: number | null;
  constructor(code: WebSearchErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'WebSearchError';
    this.code = code;
    this.status = status;
  }
}

export interface SearchWebParams {
  apiKey: string;
  model: string;
  query: string;
  /** null = web aberta (sem `include_domains`). */
  includeDomains: readonly string[] | null;
  /** Lista usada para marcar `trusted` (também na web aberta). */
  trustedDomains: readonly string[];
}

function searchPrompt(query: string): string {
  // O tema é dado do usuário; o modelo só precisa citar as fontes do plugin.
  return [
    'Liste fontes confiáveis e didáticas para estudar o tema abaixo, citando cada uma.',
    'Responda em uma frase curta por fonte.',
    '',
    '<tema>',
    query,
    '</tema>',
  ].join('\n');
}

/** Exatamente uma chamada ao OpenRouter; nunca tenta de novo (RF8). */
export async function searchWeb(params: SearchWebParams): Promise<SearchCandidateDraft[]> {
  const plugin: Record<string, unknown> = { id: 'web', engine: 'exa', max_results: MAX_CANDIDATES };
  if (params.includeDomains) plugin.include_domains = [...params.includeDomains];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
      },
      body: JSON.stringify({
        model: params.model,
        messages: [{ role: 'user', content: searchPrompt(params.query) }],
        plugins: [plugin],
        stream: false,
        max_tokens: SEARCH_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new WebSearchError('timeout', 'A busca demorou demais. Tente de novo.');
    }
    throw new WebSearchError('network', 'Falha de rede ao pesquisar na web.');
  }

  try {
    if (!res.ok) {
      // Mensagem classificada e segura: o body remoto nunca é repassado.
      const httpError = await openRouterHttpError(res);
      throw new WebSearchError('http_status', httpError.message, res.status);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new WebSearchError('bad_response', 'Resposta inválida do serviço de busca.');
    }
    return parseSearchAnnotations(data, params.trustedDomains);
  } catch (err) {
    if (err instanceof WebSearchError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new WebSearchError('timeout', 'A busca demorou demais. Tente de novo.');
    }
    throw new WebSearchError('bad_response', 'Resposta inválida do serviço de busca.');
  } finally {
    clearTimeout(timer);
  }
}
