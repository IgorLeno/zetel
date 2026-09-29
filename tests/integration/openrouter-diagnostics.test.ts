import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'sk-or-test-secret-key';
const SECRET = 'segredo-remoto';
let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-or-diag-'));
  vi.stubEnv('ZETEL_HOME', home);
  vi.stubEnv('OPENROUTER_API_KEY', KEY);
  vi.resetModules();
});

afterEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  rmSync(home, { recursive: true, force: true });
});

function keyBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    data: {
      label: `rotulo-${SECRET}`, creator_user_id: `user-${SECRET}`,
      usage: 0.5, usage_daily: 0.1, limit: 3, limit_remaining: 2.5, limit_reset: 'monthly',
      is_free_tier: false, ...overrides,
    },
  });
}

function completionError(status: number, error: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: { ...error, metadata: { ...(error.metadata as object), raw: SECRET } } }), { status });
}

/** Mock por URL: /key e /chat/completions respondem independentemente. */
function mockOpenRouter(key: () => Response, completion: () => Response) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    return String(url).endsWith('/api/v1/key') ? key() : completion();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function completionCalls(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions')).length;
}

function assertNoLeak(payload: unknown) {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(KEY);
  expect(text).not.toContain(SECRET);
  const log = join(home, 'logs', 'zetel.log');
  expect(existsSync(log)).toBe(true);
  const content = readFileSync(log, 'utf8');
  expect(content).not.toContain(KEY);
  expect(content).not.toContain(SECRET);
}

async function runTest() {
  const { POST } = await import('@/app/api/openrouter/test/route');
  const response = await POST();
  return { status: response.status, payload: await response.json() };
}

describe('diagnóstico OpenRouter (/api/v1/key)', () => {
  it('chave válida com limite disponível devolve só metadados seguros', async () => {
    const fn = mockOpenRouter(() => new Response(keyBody(), { status: 200 }), () => new Response('{}'));
    const { GET } = await import('@/app/api/openrouter/diagnostics/route');
    const payload = await (await GET()).json();
    expect(payload).toEqual({
      configured: true,
      source: 'environment',
      model: 'openai/gpt-4o-mini',
      key: {
        authenticated: true, httpStatus: 200, usage: 0.5, usageDaily: 0.1, limit: 3,
        limitRemaining: 2.5, limitReset: 'monthly', isFreeTier: false, blockedBy: null,
      },
    });
    expect(completionCalls(fn)).toBe(0);
    assertNoLeak(payload);
  });

  it('limite da chave zerado marca key-rate-limit e o teste não gasta completion', async () => {
    const fn = mockOpenRouter(
      () => new Response(keyBody({ limit_remaining: 0 }), { status: 200 }),
      () => new Response('{}'),
    );
    const { GET } = await import('@/app/api/openrouter/diagnostics/route');
    const diag = await (await GET()).json();
    expect(diag.key.blockedBy).toBe('key-rate-limit');

    const { status, payload } = await runTest();
    expect(status).toBe(400);
    expect(payload.error).toBe('Limite da chave OpenRouter atingido.');
    expect(payload.completion).toEqual({ ok: false, kind: 'key-rate-limit', skipped: true });
    expect(completionCalls(fn)).toBe(0);
    assertNoLeak(payload);
  });

  it('sem chave não chama a rede', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);
    const { GET } = await import('@/app/api/openrouter/diagnostics/route');
    expect(await (await GET()).json()).toMatchObject({ configured: false, source: null, key: null });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('teste de conexão: chave × completion', () => {
  it('chave válida e completion disponível', async () => {
    const fn = mockOpenRouter(() => new Response(keyBody(), { status: 200 }), () => new Response('{}'));
    const { status, payload } = await runTest();
    expect(status).toBe(200);
    expect(payload).toMatchObject({ ok: true, key: { authenticated: true }, completion: { ok: true } });
    expect(completionCalls(fn)).toBe(1);
  });

  it('completion 401 classifica auth', async () => {
    mockOpenRouter(() => new Response(keyBody(), { status: 200 }),
      () => completionError(401, { code: 401, message: `No auth ${SECRET}` }));
    const { payload } = await runTest();
    expect(payload.completion).toEqual({ ok: false, kind: 'auth' });
    expect(payload.error).toBe('OpenRouter rejeitou a credencial (401).');
    assertNoLeak(payload);
  });

  it('chave 401 em /key pula a completion', async () => {
    const fn = mockOpenRouter(() => new Response('{}', { status: 401 }), () => new Response('{}'));
    const { payload } = await runTest();
    expect(payload.key.authenticated).toBe(false);
    expect(payload.completion).toEqual({ ok: false, kind: 'auth', skipped: true });
    expect(completionCalls(fn)).toBe(0);
  });

  it('completion 429 do provedor upstream: chave válida, modelo limitado, sem retry', async () => {
    const fn = mockOpenRouter(() => new Response(keyBody(), { status: 200 }),
      () => completionError(429, { code: 429, message: 'Provider returned error', metadata: { provider_name: 'Mistral' } }));
    const { payload } = await runTest();
    expect(payload.key.authenticated).toBe(true);
    expect(payload.completion).toEqual({ ok: false, kind: 'provider-rate-limit' });
    expect(payload.error).toContain('provedor Mistral limitou as requisições (429)');
    expect(completionCalls(fn)).toBe(1);
    assertNoLeak(payload);
  });

  it('completion 429 sem evidência fica rate-limit-unknown', async () => {
    mockOpenRouter(() => new Response(keyBody(), { status: 200 }),
      () => completionError(429, { code: 429, message: SECRET }));
    const { payload } = await runTest();
    expect(payload.completion.kind).toBe('rate-limit-unknown');
    expect(payload.error).toBe('Limite de requisições do OpenRouter (429).');
    assertNoLeak(payload);
  });

  it.each([400, 404])('completion %i classifica model-unavailable', async (httpStatus) => {
    mockOpenRouter(() => new Response(keyBody(), { status: 200 }),
      () => completionError(httpStatus, { code: httpStatus, message: SECRET }));
    const { payload } = await runTest();
    expect(payload.completion).toEqual({ ok: false, kind: 'model-unavailable' });
    expect(payload.error).toBe(`Modelo OpenRouter inválido ou indisponível (${httpStatus}).`);
    assertNoLeak(payload);
  });
});

describe('chat com 429 do provedor', () => {
  it('mostra mensagem classificada sem body remoto e loga só o tipo', async () => {
    const vault = join(home, 'vault');
    mkdirSync(vault);
    const { getDb } = await import('@/lib/db');
    const { createZetel } = await import('@/lib/zetel-service');
    const { setSetting } = await import('@/lib/settings');
    const zetel = createZetel(getDb(), vault, 'Teste');
    setSetting('vault_path', vault);
    const fn = mockOpenRouter(() => new Response(keyBody()),
      () => completionError(429, { code: 429, message: 'Provider returned error', metadata: { provider_name: 'Mistral' } }));
    const { POST: chat } = await import('@/app/api/zetels/[id]/chat/route');
    const response = await chat(new Request(`http://localhost/api/zetels/${zetel.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Olá.' }),
    }), { params: Promise.resolve({ id: zetel.id }) });
    const events = await response.text();
    expect(events).toContain('provedor Mistral limitou as requisições (429)');
    expect(completionCalls(fn)).toBe(1);
    assertNoLeak(events);
    expect(readFileSync(join(home, 'logs', 'zetel.log'), 'utf8')).toContain('kind=provider-rate-limit');
  });
});

describe('classifyOpenRouterError', () => {
  it.each([
    [401, null, 'auth'],
    [402, { code: 402, message: 'Insufficient credits', providerName: null }, 'credits'],
    [403, { code: 403, message: 'Key limit exceeded', providerName: null }, 'key-rate-limit'],
    [429, { code: 429, message: 'x', providerName: 'Mistral' }, 'provider-rate-limit'],
    [429, { code: 429, message: 'Provider returned error', providerName: null }, 'provider-rate-limit'],
    [429, { code: 429, message: 'Rate limit exceeded: free-models-per-day', providerName: null }, 'account-rate-limit'],
    [429, null, 'rate-limit-unknown'],
    [404, null, 'model-unavailable'],
    [500, null, 'unknown'],
  ] as const)('HTTP %i → %s', async (status, info, kind) => {
    const { classifyOpenRouterError } = await import('@/lib/openrouter');
    expect(classifyOpenRouterError(status, info)).toBe(kind);
  });

  it('descarta provider_name fora do formato seguro e body não-JSON', async () => {
    const { readOpenRouterErrorInfo } = await import('@/lib/openrouter');
    expect(await readOpenRouterErrorInfo(new Response(JSON.stringify({
      error: { code: 429, message: 'm', metadata: { provider_name: '<script>alert(1)</script>' } },
    })))).toEqual({ code: 429, message: 'm', providerName: null });
    expect(await readOpenRouterErrorInfo(new Response('not json'))).toBeNull();
  });
});
