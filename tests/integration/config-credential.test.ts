import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-config-'));
  vi.stubEnv('ZETEL_HOME', home);
  vi.stubEnv('OPENROUTER_API_KEY', 'environment-key');
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

function post(body: unknown): Request {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('credencial OpenRouter persistida', () => {
  it('salva, relê em nova requisição e prioriza arquivo sobre ambiente', async () => {
    const { POST } = await import('@/app/api/config/route');
    const response = await POST(post({ apiKey: 'local-key' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, configured: true, source: 'config' });
    const { GET } = await import('@/app/api/config/route');
    expect(await (await GET()).json()).toEqual({ configured: true, source: 'config' });
    expect(readFileSync(join(home, 'config'), 'utf8')).toContain('OPENROUTER_API_KEY=local-key');
    expect(statSync(join(home, 'config')).mode & 0o777).toBe(0o600);

    vi.resetModules();
    const { resolveOpenRouterCredential } = await import('@/lib/config');
    expect(resolveOpenRouterCredential()).toEqual({ configured: true, source: 'config', key: 'local-key' });
    const { readApiKey } = await import('@/lib/openrouter');
    expect(readApiKey()).toBe('local-key');
  });

  it('preserva a chave após salvar modelo e chave TTS', async () => {
    const { POST } = await import('@/app/api/config/route');
    expect((await POST(post({ apiKey: 'local-key' }))).status).toBe(200);
    expect((await POST(post({ model: 'test/model' }))).status).toBe(200);
    const { PUT } = await import('@/app/api/settings/route');
    const tts = await PUT(new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openai_tts_key: 'tts-key' }),
    }));
    expect(tts.status).toBe(200);
    vi.resetModules();
    const { readConfig, resolveOpenRouterCredential } = await import('@/lib/config');
    expect(readConfig()).toMatchObject({ OPENROUTER_MODEL: 'test/model', openai_tts_key: 'tts-key' });
    expect(resolveOpenRouterCredential()).toMatchObject({ key: 'local-key', source: 'config' });
  });

  it('teste de conexão usa a chave efetiva e o modelo do chat', async () => {
    const { POST: save } = await import('@/app/api/config/route');
    await save(post({ apiKey: 'local-key', model: 'test/model' }));
    const { PUT } = await import('@/app/api/settings/route');
    expect((await PUT(new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_model: 'chat/model' }),
    }))).status).toBe(200);
    const externalFetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer local-key' });
      if (String(url).endsWith('/api/v1/key')) return new Response('{"data":{}}', { status: 200 });
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'chat/model' });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', externalFetch);
    const { POST: testConnection } = await import('@/app/api/openrouter/test/route');
    const response = await testConnection();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, model: 'chat/model', source: 'config',
      key: { authenticated: true }, completion: { ok: true },
    });
    expect(externalFetch).toHaveBeenCalledTimes(2);
  });

  it('usa ambiente apenas sem chave no arquivo', async () => {
    const { resolveOpenRouterCredential } = await import('@/lib/config');
    expect(resolveOpenRouterCredential()).toEqual({ configured: true, source: 'environment', key: 'environment-key' });
    const { GET } = await import('@/app/api/config/route');
    expect(await (await GET()).json()).toEqual({ configured: true, source: 'environment' });
  });

  it.each([
    [401, 'OpenRouter rejeitou a credencial (401).'],
    [400, 'Modelo OpenRouter inválido ou indisponível (400).'],
    [429, 'Limite de requisições do OpenRouter (429).'],
  ])('classifica HTTP %i sem repassar body remoto', async (status, message) => {
    const { POST: save } = await import('@/app/api/config/route');
    await save(post({ apiKey: 'local-key' }));
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'segredo-remoto' } }), { status })));
    const { POST: testConnection } = await import('@/app/api/openrouter/test/route');
    const response = await testConnection();
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe(message);
    expect(JSON.stringify(payload)).not.toContain('segredo-remoto');
  });

  it.each([
    [401, 'OpenRouter rejeitou a credencial (401).'],
    [400, 'Modelo OpenRouter inválido ou indisponível (400).'],
    [429, 'Limite de requisições do OpenRouter (429).'],
  ])('chat expõe erro HTTP %i sem body remoto', async (status, message) => {
    const { POST: save } = await import('@/app/api/config/route');
    await save(post({ apiKey: 'local-key' }));
    const vault = join(home, 'vault');
    mkdirSync(vault);
    const { getDb } = await import('@/lib/db');
    const { createZetel } = await import('@/lib/zetel-service');
    const { setSetting } = await import('@/lib/settings');
    const zetel = createZetel(getDb(), vault, 'Teste');
    setSetting('vault_path', vault);
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer local-key' });
      return new Response(JSON.stringify({ error: { message: 'segredo-remoto' } }), { status });
    }));
    const { POST: chat } = await import('@/app/api/zetels/[id]/chat/route');
    const response = await chat(new Request(`http://localhost/api/zetels/${zetel.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Olá.' }),
    }), { params: Promise.resolve({ id: zetel.id }) });
    const events = await response.text();
    expect(events).toContain(message);
    expect(events).not.toContain('segredo-remoto');
  });
});
