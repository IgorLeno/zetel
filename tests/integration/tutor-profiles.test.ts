import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamChat, type StreamChatParams } from '@/lib/openrouter';
import {
  compileTutorInstructions,
  getBuiltinProfile,
  applyOverrides,
} from '@/lib/tutor-profiles';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({ env: null as TempEnv | null }));
vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(() => null) }));
vi.mock('@/lib/config', () => ({ getOpenRouterModel: () => 'test/model' }));
vi.mock('@/lib/openrouter', () => ({
  readApiKey: vi.fn(() => 'test-key'),
  streamChat: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const profilesRoute = await import('@/app/api/tutor-profiles/route');
const profileRoute = await import('@/app/api/tutor-profiles/[id]/route');
const sessionsRoute = await import('@/app/api/zetels/[id]/sessions/route');
const chatRoute = await import('@/app/api/zetels/[id]/chat/route');
const mockedStream = vi.mocked(streamChat);

function profiles(method: 'GET' | 'POST' | 'PATCH', body?: unknown, id?: string) {
  const request = new Request(`http://localhost/api/tutor-profiles${id ? `/${id}` : ''}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (method === 'PATCH') {
    return profileRoute.PATCH(request, { params: Promise.resolve({ id: id! }) });
  }
  return method === 'GET' ? profilesRoute.GET() : profilesRoute.POST(request);
}

function sessionCall(zetelId: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  return sessionsRoute[method](
    new Request(`http://localhost/api/zetels/${zetelId}/sessions`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: zetelId }) },
  );
}

describe('perfis do tutor na API e no prompt', () => {
  let zetelId: string;
  let captured: StreamChatParams[];

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    zetelId = createZetel(state.env.db, state.env.vaultPath, 'Termo').id;
    captured = [];
    mockedStream.mockReset();
    mockedStream.mockImplementation(async function* (params: StreamChatParams) {
      captured.push(params);
      yield 'ok';
    });
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  it('lista built-ins, cria e edita personalizado, e recusa alterar built-in', async () => {
    const listed = await profiles('GET');
    expect(listed.status).toBe(200);
    const names = ((await listed.json()) as { profiles: { name: string; builtin: boolean }[] }).profiles;
    expect(names.filter((profile) => profile.builtin)).toHaveLength(6);

    const created = await profiles('POST', {
      name: 'Meu socrático',
      baseProfileId: 'professor-socratico',
      axes: { ...getBuiltinProfile('professor-socratico')!.axes, questioning: 2 },
      tone: getBuiltinProfile('professor-socratico')!.tone,
    });
    expect(created.status).toBe(201);
    const custom = ((await created.json()) as { profile: { id: string; builtin: boolean; axes: { questioning: number } } }).profile;
    expect(custom.builtin).toBe(false);
    expect(custom.axes.questioning).toBe(2);

    const edited = await profiles('PATCH', {
      axes: { ...getBuiltinProfile('professor-socratico')!.axes, questioning: 0 },
      tone: getBuiltinProfile('professor-socratico')!.tone,
    }, custom.id);
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as { profile: { axes: { questioning: number } } }).profile.axes.questioning).toBe(0);

    expect((await profiles('PATCH', { name: 'Hack' }, 'professor-socratico')).status).toBe(400);
    const still = getBuiltinProfile('professor-socratico')!;
    expect(still.axes.questioning).toBe(4);
    expect(still.name).toBe('Professor Socrático');
  });

  it('persiste cor própria do parceiro, herda da base e rejeita cor fora da paleta', async () => {
    const listed = (await (await profiles('GET')).json()) as { profiles: { id: string; color: string }[] };
    const colors = listed.profiles.map((profile) => profile.color);
    expect(new Set(colors).size).toBe(6);

    const inherited = await profiles('POST', { name: 'Herdado', baseProfileId: 'explicador' });
    expect(inherited.status).toBe(201);
    const inheritedProfile = ((await inherited.json()) as { profile: { id: string; color: string } }).profile;
    expect(inheritedProfile.color).toBe('mel');

    const chosen = await profiles('POST', { name: 'Minha', baseProfileId: 'explicador', color: 'ceu' });
    const chosenProfile = ((await chosen.json()) as { profile: { id: string; color: string } }).profile;
    expect(chosenProfile.color).toBe('ceu');

    const recolored = await profiles('PATCH', { color: 'terracota' }, chosenProfile.id);
    expect(recolored.status).toBe(200);
    expect(((await recolored.json()) as { profile: { color: string } }).profile.color).toBe('terracota');

    expect((await profiles('PATCH', { color: '#ff0000' }, chosenProfile.id)).status).toBe(400);
    expect((await profiles('POST', { name: 'X', baseProfileId: 'explicador', color: 'red;}' })).status).toBe(400);

    // Linha legada sem cor recebe cor estável da paleta.
    state.env!.db.prepare('UPDATE tutor_profiles SET color = NULL WHERE id = ?').run(inheritedProfile.id);
    const again = (await (await profiles('GET')).json()) as { profiles: { id: string; color: string }[] };
    const legacy = again.profiles.find((profile) => profile.id === inheritedProfile.id)!;
    const legacyAgain = ((await (await profiles('GET')).json()) as { profiles: { id: string; color: string }[] })
      .profiles.find((profile) => profile.id === inheritedProfile.id)!;
    expect(legacy.color).toMatch(/^[a-z]+$/);
    expect(legacyAgain.color).toBe(legacy.color);
  });

  it('envia instruções distintas ao OpenRouter quando o questioning da sessão muda', async () => {
    const created = await sessionCall(zetelId, 'POST', {});
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id;
    const base = getBuiltinProfile('conversa-livre')!;
    const high = compileTutorInstructions(applyOverrides(base, { questioning: 4 }));
    const low = compileTutorInstructions(applyOverrides(base, { questioning: 0 }));

    expect((await sessionCall(zetelId, 'PATCH', {
      sessionId, profileOverrides: { questioning: 4 },
    })).status).toBe(200);
    const first = await chatRoute.POST(
      new Request(`http://localhost/api/zetels/${zetelId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userMessage: 'Explique entalpia.' }),
      }),
      { params: Promise.resolve({ id: zetelId }) },
    );
    expect(first.status).toBe(200);
    await first.text();
    expect(captured[0].messages[0].content).toContain(high);
    expect(captured[0].messages[0].content).not.toContain(low);

    expect((await sessionCall(zetelId, 'PATCH', {
      sessionId, profileOverrides: { questioning: 0 },
    })).status).toBe(200);
    const second = await chatRoute.POST(
      new Request(`http://localhost/api/zetels/${zetelId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userMessage: 'Explique de novo.' }),
      }),
      { params: Promise.resolve({ id: zetelId }) },
    );
    expect(second.status).toBe(200);
    await second.text();
    expect(captured[1].messages[0].content).toContain(low);
    expect(captured[1].messages[0].role).toBe('system');
  });

  it('rejeita perfil inexistente na sessão', async () => {
    const created = await sessionCall(zetelId, 'POST', {});
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id;
    const res = await sessionCall(zetelId, 'PATCH', { sessionId, profileId: 'socratico' });
    expect(res.status).toBe(400);
  });
});
