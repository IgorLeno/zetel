import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPages, processZetel } from '@/lib/ingestao-service';
import type { Resolver, Transport } from '@/lib/web-fetch';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({
  env: null as TempEnv | null,
  settings: new Map<string, string>(),
  key: 'sk-or-test' as string | null,
  routes: {} as Record<string, { status?: number; headers?: Record<string, string>; body?: Buffer | string }>,
  dns: {} as Record<string, string[]>,
}));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn((key: string) =>
    key === 'vault_path' ? state.env!.vaultPath : (state.settings.get(key) ?? null),
  ),
  setSetting: vi.fn((key: string, value: string) => void state.settings.set(key, value)),
  deleteSetting: vi.fn((key: string) => void state.settings.delete(key)),
}));
vi.mock('@/lib/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...real,
    resolveOpenRouterCredential: () =>
      state.key
        ? { configured: true, source: 'config' as const, key: state.key }
        : { configured: false, source: null, key: null },
    getOpenRouterModel: () => 'test/model',
  };
});
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Sem rede real: o safeFetch verdadeiro roda com resolver/transport falsos.
vi.mock('@/lib/web-fetch', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/web-fetch')>();
  const resolver: Resolver = async (host) => {
    const ips = state.dns[host];
    if (!ips) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    return ips.map((address) => ({ address, family: 4 }));
  };
  const transport: Transport = async (req) => {
    const r = state.routes[req.url.href];
    if (!r) return { status: 404, headers: {}, body: Readable.from([]) };
    return { status: r.status ?? 200, headers: r.headers ?? {}, body: Readable.from([Buffer.from(r.body ?? '')]) };
  };
  return {
    ...real,
    safeFetch: (url: string, opts: Parameters<typeof real.safeFetch>[1] = {}) =>
      real.safeFetch(url, { ...opts, resolver, transport }),
  };
});

const { logger } = await import('@/lib/logger');
const { clearSearchCache, SEARCH_CACHE_TTL_MS } = await import('@/lib/web-search-service');
const { POST: searchRoute } = await import('@/app/api/zetels/[id]/web-sources/search/route');
const { POST: importRoute } = await import('@/app/api/zetels/[id]/web-sources/import/route');

const QUERY = 'tema-secreto série de Fourier';
const LONG = 'A série de Fourier representa funções periódicas como somas de senos e cossenos. '.repeat(5);
const ARTICLE = `<html><head><title>Série de Fourier</title></head><body><main><h1>Série de Fourier</h1><p>${LONG}</p></main></body></html>`;

const CITATIONS = [
  {
    url: 'https://pt.wikipedia.org/wiki/Fourier',
    title: 'Série de Fourier – Wikipédia',
    content: 'Trecho-secreto da Wikipédia sobre séries de Fourier e convergência.',
  },
  { url: 'https://blog.example/fourier', title: 'Blog sobre Fourier', content: 'Trecho-do-blog [x](javascript:y) <img src=a>' },
  { url: 'https://pt.wikipedia.org/wiki/Fourier#hist', title: 'Duplicada', content: 'dup' },
];

function openRouterOk(citations = CITATIONS) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Fontes encontradas.',
            annotations: citations.map((c) => ({ type: 'url_citation', url_citation: c })),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function req(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function search(zetelId: string, body: unknown) {
  return searchRoute(req(`/api/zetels/${zetelId}/web-sources/search`, body), {
    params: Promise.resolve({ id: zetelId }),
  });
}

function importCandidates(zetelId: string, body: unknown) {
  return importRoute(req(`/api/zetels/${zetelId}/web-sources/import`, body), {
    params: Promise.resolve({ id: zetelId }),
  });
}

function sentBody(call = 0): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[call]![1].body as string);
}

function allLogText(): string {
  const calls = Object.values(logger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls);
  return JSON.stringify(calls);
}

describe('POST /api/zetels/[id]/web-sources/search (SPEC-012 tarefa 002)', () => {
  let zetelId: string;
  let slug: string;

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    state.settings = new Map();
    state.key = 'sk-or-test';
    state.dns = { 'pt.wikipedia.org': ['93.184.216.34'], 'blog.example': ['93.184.216.35'] };
    state.routes = {
      'https://pt.wikipedia.org/wiki/Fourier': { headers: { 'content-type': 'text/html' }, body: ARTICLE },
      'https://blog.example/fourier': { status: 403, headers: { 'content-type': 'text/html' } },
    };
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Fourier');
    zetelId = zetel.id;
    slug = zetel.slug;
    clearSearchCache();
    vi.clearAllMocks();
    fetchMock = vi.fn(async () => openRouterOk());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  it('chama o OpenRouter uma vez com o plugin web/exa e include_domains da lista confiável', async () => {
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
    const body = sentBody();
    expect(body.model).toBe('test/model');
    expect(body.plugins).toEqual([
      {
        id: 'web',
        engine: 'exa',
        max_results: 8,
        include_domains: expect.arrayContaining(['wikipedia.org', '*.gov', 'mit.edu']),
      },
    ]);
    expect(JSON.stringify(body.messages)).toContain(QUERY);

    const data = await res.json();
    expect(data.searchId).toEqual(expect.any(String));
    expect(data.candidates).toHaveLength(2);
    expect(data.candidates[0]).toMatchObject({
      title: 'Série de Fourier – Wikipédia',
      site: 'pt.wikipedia.org',
      url: 'https://pt.wikipedia.org/wiki/Fourier',
      trusted: true,
    });
    expect(data.candidates[1]).toMatchObject({ site: 'blog.example', trusted: false });
    expect(data.candidates[0].id).not.toBe(data.candidates[1].id);
  });

  it('openWeb=true omite include_domains', async () => {
    await search(zetelId, { query: QUERY, openWeb: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody().plugins[0]).toEqual({ id: 'web', engine: 'exa', max_results: 8 });
  });

  it.each([
    [{ query: 'a', openWeb: false }],
    [{ query: 'x'.repeat(201), openWeb: false }],
    [{ query: '   ', openWeb: false }],
    [{ query: QUERY }],
    [{ query: QUERY, openWeb: 'sim' }],
    [{ query: 42, openWeb: false }],
    ['não é json'],
  ])('400 para corpo inválido %j sem chamar o OpenRouter', async (body) => {
    const res = await search(zetelId, body);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 sem chave OpenRouter, sem chamada e sem consumir o teto', async () => {
    state.key = null;
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Chave OpenRouter/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.settings.has('web_search_daily')).toBe(false);
  });

  it('429 no teto diário sem chamar o OpenRouter', async () => {
    state.settings.set('web_search_daily_limit', '2');
    expect((await search(zetelId, { query: QUERY, openWeb: false })).status).toBe(200);
    expect((await search(zetelId, { query: QUERY, openWeb: false })).status).toBe(200);
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/limite diário/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(state.settings.get('web_search_daily')!)).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      count: 2,
    });
  });

  it('400 para Zetel inexistente sem chamar o OpenRouter', async () => {
    const res = await search('nao-existe', { query: QUERY, openWeb: false });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erro HTTP do OpenRouter vira 502 com mensagem segura', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 402, message: `sem créditos ${QUERY}` } }), { status: 402 }),
    );
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toMatch(/Créditos OpenRouter/);
    expect(error).not.toContain('tema-secreto');
  });

  it('falha de rede vira 502', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(502);
  });

  it('200 com corpo não JSON vira 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }));
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(502);
  });

  it('timeout do OpenRouter vira 502 com mensagem de tempo', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/demorou/);
  });

  it('zero candidatas devolve lista vazia', async () => {
    fetchMock.mockResolvedValueOnce(openRouterOk([]));
    const res = await search(zetelId, { query: QUERY, openWeb: false });
    expect(res.status).toBe(200);
    expect((await res.json()).candidates).toEqual([]);
  });

  it('nada é persistido: sem tema/candidatas em SQLite ou no vault', async () => {
    await search(zetelId, { query: QUERY, openWeb: false });
    const dump = JSON.stringify(
      state.env!.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .flatMap((t) => state.env!.db.prepare(`SELECT * FROM "${(t as { name: string }).name}"`).all()),
    );
    expect(dump).not.toContain('tema-secreto');
    expect(dump).not.toContain('Trecho-secreto');
    expect(JSON.stringify([...state.settings.values()])).not.toMatch(/tema-secreto|wikipedia/);
    const files = state.env!.db.prepare('SELECT COUNT(*) AS n FROM zetel_files').get() as { n: number };
    expect(files.n).toBe(0);
  });

  describe('import { searchId, candidateIds, allowExcerpt }', () => {
    async function doSearch() {
      const data = await (await search(zetelId, { query: QUERY, openWeb: true })).json();
      return data as { searchId: string; candidates: { id: string; url: string }[] };
    }

    it('importa a candidata baixando pelo safeFetch e Processar gera zetel_pages', async () => {
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[0]!.id], allowExcerpt: false });
      expect(res.status).toBe(200);
      const { results } = await res.json();
      expect(results[0]).toMatchObject({ status: 'ok', extraction: 'full' });
      expect(results[0].file.sourceUrl).toBe('https://pt.wikipedia.org/wiki/Fourier');
      expect(fetchMock).toHaveBeenCalledTimes(1); // só a busca; o download vai pelo transport
      const r = processZetel(state.env!.db, state.env!.vaultPath, zetelId);
      expect(r.pagesCount).toBeGreaterThanOrEqual(1);
      expect(listPages(state.env!.db, zetelId)[0]!.contentText).toContain('Série de Fourier');
    });

    it('falha de download sem allowExcerpt devolve erro genérico', async () => {
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[1]!.id], allowExcerpt: false });
      const { results } = await res.json();
      expect(results[0].status).toBe('error');
      expect(results[0].message).not.toContain('blog.example');
    });

    it('fallback de trecho grava extraction: excerpt com o snippet do cache', async () => {
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[1]!.id], allowExcerpt: true });
      const { results } = await res.json();
      expect(results[0]).toMatchObject({ status: 'ok', extraction: 'excerpt' });
      const file = results[0].file;
      expect(file.filename).toBe('web-blog-sobre-fourier.md');
      expect(file.sourceUrl).toBe('https://blog.example/fourier');
      const md = readFileSync(join(state.env!.vaultPath, 'zetels', slug, 'arquivos', file.filename), 'utf8');
      expect(md).toContain('source_url: "https://blog.example/fourier"');
      expect(md).toContain('extraction: excerpt\n---\n# Blog sobre Fourier\n');
      expect(md).toContain('Trecho-do-blog');
      // O snippet entra escapado: sem link ou HTML ativos.
      expect(md).toContain('\\[x\\](javascript:y)');
      expect(md).toContain('\\<img src=a\\>');
      const r = processZetel(state.env!.db, state.env!.vaultPath, zetelId);
      expect(r.pagesCount).toBeGreaterThanOrEqual(1);
    });

    it('o cliente não injeta URL nem trecho: campos extras são ignorados e ids desconhecidos falham', async () => {
      const { searchId } = await doSearch();
      const res = await importCandidates(zetelId, {
        searchId,
        candidateIds: ['forjado'],
        allowExcerpt: true,
        urls: ['https://evil.example/x'],
        snippet: 'texto do cliente',
        candidates: [{ id: 'forjado', url: 'https://evil.example/x', snippet: 'texto do cliente' }],
      });
      expect(res.status).toBe(200);
      const { results } = await res.json();
      expect(results).toEqual([{ status: 'error', message: expect.stringMatching(/não encontrada/) }]);
      const files = state.env!.db.prepare('SELECT COUNT(*) AS n FROM zetel_files').get() as { n: number };
      expect(files.n).toBe(0);
    });

    it('candidata em host não público não vira trecho, mesmo com allowExcerpt (review F001)', async () => {
      state.dns['intra.example'] = ['10.0.0.7'];
      fetchMock.mockResolvedValueOnce(
        openRouterOk([{ url: 'https://intra.example/admin', title: 'Interno', content: 'Trecho interno.' }]),
      );
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[0]!.id], allowExcerpt: true });
      const { results } = await res.json();
      expect(results[0]).toEqual({ status: 'error', message: expect.stringMatching(/não é público/) });
      const files = state.env!.db.prepare('SELECT COUNT(*) AS n FROM zetel_files').get() as { n: number };
      expect(files.n).toBe(0);
    });

    it('sem trecho na busca, a falha de download continua erro com allowExcerpt', async () => {
      fetchMock.mockResolvedValueOnce(openRouterOk([{ url: 'https://blog.example/fourier', title: 'Blog', content: '' }]));
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[0]!.id], allowExcerpt: true });
      const { results } = await res.json();
      expect(results[0].status).toBe('error');
      const files = state.env!.db.prepare('SELECT COUNT(*) AS n FROM zetel_files').get() as { n: number };
      expect(files.n).toBe(0);
    });

    it('id válido com urls do cliente: baixa só a URL do cache', async () => {
      state.routes['https://evil.example/x'] = { headers: { 'content-type': 'text/html' }, body: ARTICLE };
      state.dns['evil.example'] = ['93.184.216.99'];
      const { searchId, candidates } = await doSearch();
      const res = await importCandidates(zetelId, {
        searchId,
        candidateIds: [candidates[0]!.id],
        allowExcerpt: false,
        urls: ['https://evil.example/x'],
      });
      const { results } = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].file.sourceUrl).toBe('https://pt.wikipedia.org/wiki/Fourier');
    });

    it('searchId desconhecido devolve 404', async () => {
      const res = await importCandidates(zetelId, { searchId: 'nao-existe', candidateIds: ['a'], allowExcerpt: false });
      expect(res.status).toBe(404);
    });

    it('searchId expirado (30 min) devolve 404', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 7, 10, 0, 0));
      const { searchId, candidates } = await doSearch();
      vi.setSystemTime(new Date(Date.now() + SEARCH_CACHE_TTL_MS + 1));
      const res = await importCandidates(zetelId, { searchId, candidateIds: [candidates[0]!.id], allowExcerpt: false });
      expect(res.status).toBe(404);
    });

    it('searchId de outro Zetel devolve 404', async () => {
      const { searchId, candidates } = await doSearch();
      const other = createZetel(state.env!.db, state.env!.vaultPath, 'Outro');
      const res = await importCandidates(other.id, { searchId, candidateIds: [candidates[0]!.id], allowExcerpt: false });
      expect(res.status).toBe(404);
    });

    it.each([
      [{ searchId: 'x', candidateIds: [], allowExcerpt: false }],
      [{ searchId: 'x', candidateIds: ['1', '2', '3', '4', '5', '6'], allowExcerpt: false }],
      [{ searchId: 'x', candidateIds: ['1'], allowExcerpt: 'sim' }],
      [{ searchId: 'x', candidateIds: ['1', '1'], allowExcerpt: false }],
      [{ searchId: '', candidateIds: ['1'], allowExcerpt: false }],
      [{ searchId: 'x', candidateIds: [1], allowExcerpt: false }],
    ])('400 para corpo inválido %j', async (body) => {
      const res = await importCandidates(zetelId, body);
      expect(res.status).toBe(400);
    });

    it('nenhum log contém tema, URL, domínio, título ou trecho', async () => {
      const { searchId, candidates } = await doSearch();
      await importCandidates(zetelId, {
        searchId,
        candidateIds: candidates.map((c) => c.id),
        allowExcerpt: true,
      });
      await importCandidates(zetelId, { searchId, candidateIds: [candidates[1]!.id], allowExcerpt: false });
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
      await search(zetelId, { query: QUERY, openWeb: false });
      const logs = allLogText();
      expect(logs).toContain('web search done');
      for (const secret of ['tema-secreto', 'Fourier', 'wikipedia', 'blog.example', 'Trecho', 'https://', 'sk-or-test']) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});
