import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-tts-settings-'));
  vi.stubEnv('ZETEL_HOME', home);
  vi.resetModules();
});

afterEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(home, { recursive: true, force: true });
});

function put(body: unknown): Request {
  return new Request('http://localhost/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('configuração de voz TTS', () => {
  it('expõe os padrões novos sem configuração salva', async () => {
    const { GET } = await import('@/app/api/settings/route');
    const { DEFAULT_TTS_INSTRUCTIONS } = await import('@/lib/openai-voice');
    expect(await (await GET()).json()).toMatchObject({
      tts_model: 'gpt-4o-mini-tts',
      tts_voice: 'marin',
      tts_instructions: DEFAULT_TTS_INSTRUCTIONS,
    });
  });

  it('salva tts_instructions e volta ao padrão quando vazia', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    const { DEFAULT_TTS_INSTRUCTIONS } = await import('@/lib/openai-voice');

    const saved = await PUT(put({ tts_instructions: '  Fale devagar.  ' }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ tts_instructions: 'Fale devagar.' });

    const cleared = await PUT(put({ tts_instructions: '' }));
    expect(cleared.status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({ tts_instructions: DEFAULT_TTS_INSTRUCTIONS });
  });

  it('rejeita tts_instructions não-string ou acima do limite', async () => {
    const { PUT } = await import('@/app/api/settings/route');
    expect((await PUT(put({ tts_instructions: 42 }))).status).toBe(400);
    expect((await PUT(put({ tts_instructions: 'a'.repeat(2001) }))).status).toBe(400);
    expect((await PUT(put({ tts_instructions: 'a'.repeat(2000) }))).status).toBe(200);
  });
});
