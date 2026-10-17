import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-live-settings-'));
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

describe('voz do modo Live (SPEC-016 D10)', () => {
  it('padrão Kore sem valor salvo', async () => {
    const { GET } = await import('@/app/api/settings/route');
    expect(await (await GET()).json()).toMatchObject({ live_voice: 'Kore' });
  });

  it('salva voz Gemini válida sem mexer na voz TTS', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    const saved = await PUT(put({ live_voice: ' Puck ' }));
    expect(saved.status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({ live_voice: 'Puck', tts_voice: 'marin' });
  });

  it.each([['marin'], ['kore'], ['Desconhecida'], [42]])('rejeita %s com 400', async (voice) => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    expect((await PUT(put({ live_voice: voice }))).status).toBe(400);
    expect(await (await GET()).json()).toMatchObject({ live_voice: 'Kore' });
  });

  it('vazio volta ao padrão', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    await PUT(put({ live_voice: 'Puck' }));
    expect((await PUT(put({ live_voice: '' }))).status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({ live_voice: 'Kore' });
  });

  it('voz inválida não grava parcialmente outros campos de voz', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    expect((await PUT(put({ tts_voice: 'coral', live_voice: 'nope' }))).status).toBe(400);
    expect(await (await GET()).json()).toMatchObject({ tts_voice: 'marin', live_voice: 'Kore' });
  });
});
