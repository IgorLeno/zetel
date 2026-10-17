import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-same-origin-'));
  vi.stubEnv('ZETEL_HOME', home);
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.resetModules();
});

afterEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(home, { recursive: true, force: true });
});

const ATTACKER = 'attacker-key-123';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function call(url: string, method: string, headers: Record<string, string>, body: unknown): Request {
  return new Request(`http://localhost:3000${url}`, { method, headers, body: JSON.stringify(body) });
}

function configFile(): string {
  const path = join(home, 'config');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

async function seedConfig() {
  const { writeConfig } = await import('@/lib/config');
  writeConfig('OPENROUTER_API_KEY', 'or-original');
  writeConfig('GEMINI_API_KEY', 'gm-original');
  writeConfig('openai_tts_key', 'oa-original');
  return configFile();
}

const ROUTES = [
  { name: 'POST /api/config', url: '/api/config', method: 'POST', module: '@/app/api/config/route', body: { apiKey: ATTACKER } },
  { name: 'POST /api/config/gemini', url: '/api/config/gemini', method: 'POST', module: '@/app/api/config/gemini/route', body: { apiKey: ATTACKER } },
  { name: 'PUT /api/settings', url: '/api/settings', method: 'PUT', module: '@/app/api/settings/route', body: { openai_tts_key: ATTACKER } },
] as const;

async function handlerFor(route: (typeof ROUTES)[number]) {
  const mod = await import(route.module);
  return mod[route.method] as (request: Request) => Promise<Response>;
}

describe.each(ROUTES)('$name rejeita escrita de segredo cross-site (SPEC-017)', (route) => {
  it('text/plain (simple request sem preflight) → 415 e config intacto', async () => {
    const before = await seedConfig();
    const handler = await handlerFor(route);
    const response = await handler(call(route.url, route.method, { 'Content-Type': 'text/plain' }, route.body));
    expect(response.status).toBe(415);
    expect(configFile()).toBe(before);
    expect(configFile()).not.toContain(ATTACKER);
  });

  it('Origin de outro site → 403 e config intacto', async () => {
    const before = await seedConfig();
    const handler = await handlerFor(route);
    const response = await handler(call(route.url, route.method, {
      ...JSON_HEADERS, Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site',
    }, route.body));
    expect(response.status).toBe(403);
    expect(configFile()).toBe(before);
  });

  it('JSON sem Origin nem Sec-Fetch-Site (cliente local) continua gravando', async () => {
    await seedConfig();
    const handler = await handlerFor(route);
    const response = await handler(call(route.url, route.method, JSON_HEADERS, route.body));
    expect(response.status).toBe(200);
    expect(configFile()).toContain(ATTACKER);
  });

  it('JSON same-origin do navegador continua gravando', async () => {
    await seedConfig();
    const handler = await handlerFor(route);
    const response = await handler(call(route.url, route.method, {
      ...JSON_HEADERS, Origin: 'http://localhost:3000', 'Sec-Fetch-Site': 'same-origin',
    }, route.body));
    expect(response.status).toBe(200);
  });
});

describe('PUT /api/settings valida valores do config antes de gravar (EQ-001)', () => {
  it.each([
    ['default_model com LF', { default_model: 'model\nOPENROUTER_API_KEY=x', chat_model: 'outro/modelo' }],
    ['default_model com NUL', { default_model: 'mo\u0000del', chat_model: 'outro/modelo' }],
    ['openai_tts_key com CR', { openai_tts_key: 'k\rOPENROUTER_API_KEY=x', chat_model: 'outro/modelo' }],
    ['openai_tts_key com CRLF após gravar default_model', { default_model: 'novo/modelo', openai_tts_key: 'k\r\nX=1' }],
  ])('%s → 400 sem gravação em SQLite nem config', async (_label, body) => {
    const before = await seedConfig();
    const { PUT, GET } = await import('@/app/api/settings/route');
    const settingsBefore = await (await GET()).json();
    const response = await PUT(call('/api/settings', 'PUT', JSON_HEADERS, body));
    expect(response.status).toBe(400);
    expect(configFile()).toBe(before);
    expect(await (await GET()).json()).toEqual(settingsBefore);
  });

  it('espaços e quebra nas pontas continuam aceitos (valor é aparado)', async () => {
    await seedConfig();
    const { PUT } = await import('@/app/api/settings/route');
    const response = await PUT(call('/api/settings', 'PUT', JSON_HEADERS, { default_model: '  novo/modelo\n' }));
    expect(response.status).toBe(200);
    expect(configFile()).toContain('OPENROUTER_MODEL=novo/modelo\n');
  });
});
