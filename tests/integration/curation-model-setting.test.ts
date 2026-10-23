import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let home: string;

beforeEach(() => {
  globalThis.__zetelDb?.close();
  globalThis.__zetelDb = undefined;
  home = mkdtempSync(join(tmpdir(), 'zetel-curation-model-'));
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

describe('curation_model (SPEC-018 D9)', () => {
  it('sem valor salvo, a curadoria usa o modelo efetivo do chat', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    const { resolveCurationModel } = await import('@/lib/curation-service');
    await PUT(put({ chat_model: 'chat/modelo' }));
    expect(await (await GET()).json()).toMatchObject({ curation_model: null });
    expect(resolveCurationModel()).toBe('chat/modelo');
  });

  it('salva, registra histórico e vazio limpa', async () => {
    const { PUT, GET } = await import('@/app/api/settings/route');
    const { resolveCurationModel } = await import('@/lib/curation-service');
    expect((await PUT(put({ curation_model: ' cur/modelo ' }))).status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({
      curation_model: 'cur/modelo',
      curation_model_history: ['cur/modelo'],
    });
    expect(resolveCurationModel()).toBe('cur/modelo');

    expect((await PUT(put({ curation_model: '' }))).status).toBe(200);
    expect(await (await GET()).json()).toMatchObject({ curation_model: null });
  });

  it('rejeita valor não string', async () => {
    const { PUT } = await import('@/app/api/settings/route');
    expect((await PUT(put({ curation_model: 7 }))).status).toBe(400);
  });
});
