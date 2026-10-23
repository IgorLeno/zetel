import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/openrouter', () => ({ readApiKey: vi.fn(() => 'k'), requestJson: vi.fn() }));
vi.mock('@/lib/openrouter-diagnostics', () => ({ effectiveChatModel: vi.fn(() => 'chat/model') }));

const { GET, PATCH, POST } = await import('@/app/api/zetels/[id]/curation/route');
const { importZetelReports } = await import('@/lib/report-import-service');
const { buildReportCatalog } = await import('@/lib/curation-service');
const { readApiKey, requestJson } = await import('@/lib/openrouter');
const { createZetel } = await import('@/lib/zetel-service');

const URL_BASE = 'http://localhost:3000/api/zetels';
const JSON_HEADERS = { Host: 'localhost:3000', 'Content-Type': 'application/json' };

function call(method: 'POST' | 'PATCH', zetelId: string, body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  const handler = method === 'POST' ? POST : PATCH;
  return handler(
    new Request(`${URL_BASE}/${zetelId}/curation`, { method, headers, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: zetelId }) },
  );
}

async function list(zetelId: string) {
  const res = await GET(new Request(`${URL_BASE}/${zetelId}/curation`), { params: Promise.resolve({ id: zetelId }) });
  return { status: res.status, body: await res.json() };
}

describe('/api/zetels/[id]/curation (SPEC-018 tarefa 006)', () => {
  let channel: string;
  let zetelId: string;
  let slug: string;

  beforeEach(() => {
    vi.clearAllMocks();
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Termo');
    zetelId = zetel.id;
    slug = zetel.slug;
    channel = join(tmpdir(), `zetel-canal-cur-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(channel, 'inbox', slug), { recursive: true });
    writeFileSync(join(channel, 'inbox', slug, 'r.md'), reportFixture(slug));
    importZetelReports(state.env.db, state.env.vaultPath, channel, zetelId);
    state.settings = { vault_path: state.env.vaultPath };
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    rmSync(channel, { recursive: true, force: true });
  });

  it('POST cura, GET lista, PATCH confirma e grava no vault', async () => {
    const [block] = buildReportCatalog(reportFixture(slug));
    vi.mocked(requestJson).mockResolvedValueOnce({
      content: JSON.stringify({ candidatos: [{ tipo: 'nota', anchor: block.anchor, titulo: 'Nota', corpo: 'Corpo' }] }),
      usage: null,
    } as never);

    const run = await call('POST', zetelId, {});
    expect(run.status).toBe(200);
    expect(await run.json()).toEqual({ curated: 1, failed: 0, candidates: 1 });

    const { body } = await list(zetelId);
    expect(body.reports).toHaveLength(1);
    const [candidate] = body.reports[0].candidates;
    expect(candidate).toMatchObject({ kind: 'nota', fields: { titulo: 'Nota', corpo: 'Corpo' } });
    expect(JSON.stringify(body)).not.toContain('contentHash');

    const res = await call('PATCH', zetelId, { id: candidate.id, action: 'confirm' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'confirmed', path: `zetels/${slug}/notas-rapidas/nota.md` });
    expect((await call('PATCH', zetelId, { id: candidate.id, action: 'reject' })).status).toBe(409);
  });

  it('mutações cross-site (403) ou sem JSON (415) não decidem nem curam', async () => {
    const cross = { ...JSON_HEADERS, 'Sec-Fetch-Site': 'cross-site' };
    expect((await call('POST', zetelId, {}, cross)).status).toBe(403);
    expect((await call('PATCH', zetelId, { id: 'x', action: 'reject' }, cross)).status).toBe(403);
    expect((await call('PATCH', zetelId, { id: 'x', action: 'reject' }, { Host: 'localhost:3000', 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it.each([
    ['sem id', { action: 'confirm' }],
    ['ação desconhecida', { id: 'x', action: 'delete' }],
    ['rejeitar com edição', { id: 'x', action: 'reject', edit: { titulo: 't' } }],
    ['corpo não objeto', 'texto'],
  ])('PATCH inválido (%s) → 400', async (_label, body) => {
    expect((await call('PATCH', zetelId, body)).status).toBe(400);
  });

  it('PATCH com edição inválida → 400; candidato inexistente → 404', async () => {
    state.env!.db.prepare(
      `INSERT INTO curation_candidates (id, import_id, kind, anchor, payload, status)
       SELECT 'c1', id, 'nota', 'a', '{"titulo":"t","corpo":"c","source":{"contentHash":"h","section":[]}}', 'pending'
       FROM channel_imports`,
    ).run();
    expect((await call('PATCH', zetelId, { id: 'c1', action: 'confirm', edit: { titulo: '' } })).status).toBe(400);
    expect((await call('PATCH', zetelId, { id: 'nada', action: 'reject' })).status).toBe(404);
  });

  it('sem vault → 400; sem chave → 400; Zetel inexistente → 404', async () => {
    state.settings = {};
    expect((await call('POST', zetelId, {})).status).toBe(400);
    expect((await call('PATCH', zetelId, { id: 'x', action: 'reject' })).status).toBe(400);
    state.settings = { vault_path: state.env!.vaultPath };
    vi.mocked(readApiKey).mockImplementationOnce(() => {
      throw new Error('sem chave');
    });
    expect((await call('POST', zetelId, {})).status).toBe(400);
    expect((await call('POST', 'nao-existe', {})).status).toBe(404);
    expect((await list('nao-existe')).status).toBe(404);
  });
});
