import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zetel-gemini-'));
  vi.stubEnv('ZETEL_HOME', home);
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  rmSync(home, { recursive: true, force: true });
});

function post(body: unknown): Request {
  return new Request('http://localhost/api/config/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('credencial Gemini (SPEC-016 D7)', () => {
  it('sem arquivo nem ambiente: não configurada', async () => {
    const { resolveGeminiCredential } = await import('@/lib/config');
    expect(resolveGeminiCredential()).toEqual({ configured: false, source: null, key: null });
  });

  it('usa ambiente só sem chave no arquivo; espaços contam como ausente', async () => {
    vi.stubEnv('GEMINI_API_KEY', '   ');
    const { resolveGeminiCredential } = await import('@/lib/config');
    expect(resolveGeminiCredential().configured).toBe(false);
    vi.stubEnv('GEMINI_API_KEY', ' env-gemini ');
    expect(resolveGeminiCredential()).toEqual({ configured: true, source: 'environment', key: 'env-gemini' });
  });

  it('salva no ~/.zetel/config (600), prioriza o arquivo e nunca devolve a chave', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST, GET } = await import('@/app/api/config/gemini/route');
    const response = await POST(post({ apiKey: '  file-gemini-secret  ' }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ ok: true, configured: true, source: 'config' });
    expect(await (await GET()).json()).toEqual({ configured: true, source: 'config' });
    expect(readFileSync(join(home, 'config'), 'utf8')).toContain('GEMINI_API_KEY=file-gemini-secret');
    expect(statSync(join(home, 'config')).mode & 0o777).toBe(0o600);
    const logged = JSON.stringify([...info.mock.calls, ...log.mock.calls]);
    expect(logged).not.toContain('file-gemini-secret');
    const logFile = join(home, 'logs', 'zetel.log');
    if (existsSync(logFile)) expect(readFileSync(logFile, 'utf8')).not.toContain('file-gemini-secret');

    vi.resetModules();
    const { resolveGeminiCredential } = await import('@/lib/config');
    expect(resolveGeminiCredential()).toEqual({ configured: true, source: 'config', key: 'file-gemini-secret' });
  });

  it('não toca a chave OpenRouter salva', async () => {
    const { POST: saveOpenRouter } = await import('@/app/api/config/route');
    await saveOpenRouter(new Request('http://localhost/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'or-key' }),
    }));
    const { POST } = await import('@/app/api/config/gemini/route');
    expect((await POST(post({ apiKey: 'gm-key' }))).status).toBe(200);
    vi.resetModules();
    const { readConfig, resolveOpenRouterCredential } = await import('@/lib/config');
    expect(readConfig()).toMatchObject({ OPENROUTER_API_KEY: 'or-key', GEMINI_API_KEY: 'gm-key' });
    expect(resolveOpenRouterCredential()).toMatchObject({ key: 'or-key', source: 'config' });
  });

  it.each([
    ['JSON inválido', '{'],
    ['corpo não objeto', []],
    ['sem apiKey', {}],
    ['apiKey vazia', { apiKey: '   ' }],
    ['apiKey não string', { apiKey: 42 }],
  ])('rejeita %s com 400 sem gravar', async (_label, body) => {
    const { POST, GET } = await import('@/app/api/config/gemini/route');
    expect((await POST(post(body))).status).toBe(400);
    expect(await (await GET()).json()).toEqual({ configured: false, source: null });
  });

  it.each([
    ['quebra de linha', 'gm-key\nOPENROUTER_API_KEY=attacker-key'],
    ['carriage return', 'gm-key\rOPENROUTER_API_KEY=attacker-key'],
    ['NUL', 'gm\u0000key'],
    ['espaço interno', 'gm key'],
    ['sinal de igual', 'gm=key'],
  ])('rejeita chave com %s sem alterar o config', async (_label, apiKey) => {
    const { POST: saveOpenRouter } = await import('@/app/api/config/route');
    await saveOpenRouter(new Request('http://localhost/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'or-key' }),
    }));
    const before = readFileSync(join(home, 'config'), 'utf8');
    const { POST } = await import('@/app/api/config/gemini/route');
    expect((await POST(post({ apiKey }))).status).toBe(400);
    expect(readFileSync(join(home, 'config'), 'utf8')).toBe(before);
  });

  it('writeConfig recusa valor com quebra de linha ou NUL sem gravar', async () => {
    const { writeConfig, readConfig } = await import('@/lib/config');
    writeConfig('OPENROUTER_API_KEY', 'or-key');
    expect(() => writeConfig('openai_tts_key', 'x\nOPENROUTER_API_KEY=attacker')).toThrow();
    expect(() => writeConfig('OPENROUTER_MODEL', 'm\r\nX=1')).toThrow();
    expect(() => writeConfig('a\nb', 'v')).toThrow();
    expect(() => writeConfig('k', 'v\u0000')).toThrow();
    expect(readConfig()).toEqual({ OPENROUTER_API_KEY: 'or-key' });
  });
});
