import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { reportFixture } from '@/tests/helpers/channel-fixture';

const state = vi.hoisted(() => ({
  env: null as TempEnv | null,
  settings: {} as Record<string, string | null>,
}));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSetting: vi.fn((key: string) => state.settings[key] ?? null),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { POST } = await import('@/app/api/zetels/[id]/reports/import/route');
const { PUT: putSettings } = await import('@/app/api/settings/route');
const { createZetel } = await import('@/lib/zetel-service');
const settings = await import('@/lib/settings');

function post(zetelId: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  return POST(
    new Request(`http://localhost:3000/api/zetels/${zetelId}/reports/import`, {
      method: 'POST',
      headers: { Host: 'localhost:3000', ...headers },
      body: '{}',
    }),
    { params: Promise.resolve({ id: zetelId }) },
  );
}

describe('POST /api/zetels/[id]/reports/import (SPEC-018 tarefa 003)', () => {
  let channel: string;
  let zetelId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    channel = join(tmpdir(), `zetel-canal-rota-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Fourier');
    zetelId = zetel.id;
    mkdirSync(join(channel, 'inbox', zetel.slug), { recursive: true });
    writeFileSync(join(channel, 'inbox', zetel.slug, 'r.md'), reportFixture(zetel.slug));
    state.settings = { vault_path: state.env.vaultPath, channel_dir: channel };
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    rmSync(channel, { recursive: true, force: true });
  });

  it('importa e devolve só as contagens', async () => {
    const res = await post(zetelId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ imported: 1, skipped: 0, invalid: 0 });
    expect(await (await post(zetelId)).json()).toEqual({ imported: 0, skipped: 1, invalid: 0 });
  });

  it('recusa chamada cross-site (403) e sem JSON (415) sem importar', async () => {
    const cross = await post(zetelId, { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' });
    expect(cross.status).toBe(403);
    const plain = await post(zetelId, { 'Content-Type': 'text/plain' });
    expect(plain.status).toBe(415);
    expect(state.env!.db.prepare('SELECT COUNT(*) AS n FROM channel_imports').get()).toEqual({ n: 0 });
  });

  it('sem vault ou sem canal configurado → 400', async () => {
    state.settings = { vault_path: state.env!.vaultPath };
    expect((await post(zetelId)).status).toBe(400);
    state.settings = { channel_dir: channel };
    expect((await post(zetelId)).status).toBe(400);
  });

  it('canal configurado que deixou de ser válido → 400 sem ecoar o caminho', async () => {
    state.settings.channel_dir = join(channel, 'sumiu');
    const res = await post(zetelId);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain(channel);
  });

  it('Zetel inexistente → 404', async () => {
    expect((await post('nao-existe')).status).toBe(404);
  });

  it('PUT /api/settings grava channel_dir validado e recusa o vault', async () => {
    const put = (channel_dir: string) =>
      putSettings(
        new Request('http://localhost:3000/api/settings', {
          method: 'PUT',
          headers: { Host: 'localhost:3000', 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_dir }),
        }),
      );
    expect((await put(state.env!.vaultPath)).status).toBe(400);
    expect(settings.setSetting).not.toHaveBeenCalledWith('channel_dir', expect.anything());
    expect((await put(channel)).status).toBe(200);
    expect(settings.setSetting).toHaveBeenCalledWith('channel_dir', realpathSync(channel));
    expect((await put('')).status).toBe(200);
    expect(settings.deleteSetting).toHaveBeenCalledWith('channel_dir');
  });

  it('PUT /api/settings com outro campo inválido não grava channel_dir', async () => {
    const res = await putSettings(
      new Request('http://localhost:3000/api/settings', {
        method: 'PUT',
        headers: { Host: 'localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_dir: channel, chat_history_window: 999 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(settings.setSetting).not.toHaveBeenCalledWith('channel_dir', expect.anything());
  });
});
