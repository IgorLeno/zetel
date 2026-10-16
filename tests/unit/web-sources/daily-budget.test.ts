import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn((key: string) => store.get(key) ?? null),
  setSetting: vi.fn((key: string, value: string) => void store.set(key, value)),
  deleteSetting: vi.fn((key: string) => void store.delete(key)),
}));

const {
  DEFAULT_DAILY_LIMIT,
  SEARCH_CACHE_TTL_MS,
  cacheSearch,
  clearSearchCache,
  getCachedSearch,
  readDailyLimit,
  readTrustedDomains,
  reserveDailySearch,
  DEFAULT_TRUSTED_DOMAINS,
} = await import('@/lib/web-search-service');

const DAY1 = new Date(2026, 9, 7, 10, 0, 0);
const DAY2 = new Date(2026, 9, 8, 0, 0, 1);

describe('teto diário de buscas (SPEC-012 RF8)', () => {
  beforeEach(() => store.clear());

  it('padrão de 20 por dia e 429 lógico no 21º', () => {
    expect(readDailyLimit()).toBe(DEFAULT_DAILY_LIMIT);
    expect(DEFAULT_DAILY_LIMIT).toBe(20);
    for (let i = 1; i <= 20; i++) {
      expect(reserveDailySearch(DAY1)).toEqual({ ok: true, count: i, limit: 20 });
    }
    expect(reserveDailySearch(DAY1)).toEqual({ ok: false, count: 20, limit: 20 });
    expect(JSON.parse(store.get('web_search_daily')!)).toEqual({ date: '2026-10-07', count: 20 });
  });

  it('o contador guarda só data e contagem', () => {
    reserveDailySearch(DAY1);
    expect(Object.keys(JSON.parse(store.get('web_search_daily')!)).sort()).toEqual(['count', 'date']);
  });

  it('zera na virada do dia', () => {
    store.set('web_search_daily', JSON.stringify({ date: '2026-10-07', count: 20 }));
    expect(reserveDailySearch(DAY2)).toEqual({ ok: true, count: 1, limit: 20 });
  });

  it('respeita web_search_daily_limit válido (1–200)', () => {
    store.set('web_search_daily_limit', '2');
    reserveDailySearch(DAY1);
    reserveDailySearch(DAY1);
    expect(reserveDailySearch(DAY1).ok).toBe(false);
  });

  it.each(['0', '201', 'abc', '2.5', '-1', ''])('ignora limite inválido %j', (v) => {
    store.set('web_search_daily_limit', v);
    expect(readDailyLimit()).toBe(20);
  });

  it('contador corrompido recomeça do zero', () => {
    store.set('web_search_daily', '{lixo');
    expect(reserveDailySearch(DAY1)).toEqual({ ok: true, count: 1, limit: 20 });
    store.set('web_search_daily', JSON.stringify({ date: '2026-10-07', count: -5 }));
    expect(reserveDailySearch(DAY1)).toEqual({ ok: true, count: 1, limit: 20 });
  });
});

describe('lista confiável (setting web_search_domains)', () => {
  beforeEach(() => store.clear());

  it('usa o padrão sem setting', () => {
    expect(readTrustedDomains()).toEqual(DEFAULT_TRUSTED_DOMAINS);
  });

  it('usa a lista salva quando é um array válido de domínios', () => {
    store.set('web_search_domains', JSON.stringify(['Exemplo.org', '*.gov']));
    expect(readTrustedDomains()).toEqual(['exemplo.org', '*.gov']);
  });

  it.each(['{', '"x"', '[1]', '["http://a.org"]', '["a b"]', JSON.stringify(Array(51).fill('a.org'))])(
    'cai no padrão com setting inválido %s',
    (v) => {
      store.set('web_search_domains', v);
      expect(readTrustedDomains()).toEqual(DEFAULT_TRUSTED_DOMAINS);
    },
  );
});

describe('cache de buscas em processo (SPEC-012 RF6 / D6)', () => {
  beforeEach(() => clearSearchCache());

  const drafts = [
    { title: 'A', site: 'a.org', snippet: 'sa', url: 'https://a.org/1', trusted: true },
    { title: 'B', site: 'b.org', snippet: 'sb', url: 'https://b.org/2', trusted: false },
  ];

  it('gera searchId e ids de candidata opacos e resolve pelo cache', () => {
    const t0 = Date.now();
    const { searchId, candidates } = cacheSearch('z1', drafts, t0);
    expect(searchId).toMatch(/^[\w-]{16,}$/);
    expect(new Set(candidates.map((c) => c.id)).size).toBe(2);
    expect(candidates[0]).toMatchObject(drafts[0]!);
    expect(getCachedSearch('z1', searchId, t0 + 1000)).toEqual(candidates);
  });

  it('é por Zetel', () => {
    const { searchId } = cacheSearch('z1', drafts);
    expect(getCachedSearch('z2', searchId)).toBeNull();
  });

  it('expira após 30 min', () => {
    expect(SEARCH_CACHE_TTL_MS).toBe(30 * 60 * 1000);
    const t0 = 1_000_000;
    const { searchId } = cacheSearch('z1', drafts, t0);
    expect(getCachedSearch('z1', searchId, t0 + SEARCH_CACHE_TTL_MS - 1)).not.toBeNull();
    expect(getCachedSearch('z1', searchId, t0 + SEARCH_CACHE_TTL_MS)).toBeNull();
  });

  it('searchId desconhecido devolve null', () => {
    expect(getCachedSearch('z1', 'nao-existe')).toBeNull();
  });

  it('não cresce sem limite', () => {
    const t0 = Date.now();
    const first = cacheSearch('z1', drafts, t0).searchId;
    for (let i = 0; i < 200; i++) cacheSearch('z1', drafts, t0);
    expect(getCachedSearch('z1', first, t0)).toBeNull();
  });
});
