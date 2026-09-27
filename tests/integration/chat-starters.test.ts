import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { streamChat, type StreamChatParams } from '@/lib/openrouter';
import { starterCanonical, starterInstruction } from '@/lib/chat-starters';

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

const { POST } = await import('@/app/api/zetels/[id]/chat/route');
const mockedStream = vi.mocked(streamChat);

function post(zetelId: string, body: Record<string, unknown>) {
  return POST(new Request(`http://localhost/api/zetels/${zetelId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: zetelId }) });
}

describe('starters no chat', () => {
  let zetelId: string;
  let captured: StreamChatParams[];

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    zetelId = createZetel(state.env.db, state.env.vaultPath, 'Aula').id;
    captured = [];
    mockedStream.mockReset();
    mockedStream.mockImplementation(async function* (params) {
      captured.push(params);
      yield 'Uma pergunta sobre o foco.';
    });
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  it('aceita starter sem userMessage e persiste o texto canônico', async () => {
    const res = await post(zetelId, { starter: 'ask-question' });
    expect(res.status).toBe(200);
    await res.text();

    const rows = state.env!.db.prepare(
      `SELECT role, content, meta FROM chat_messages WHERE zetel_id = ? ORDER BY created_at ASC`,
    ).all(zetelId) as Array<{ role: string; content: string; meta: string | null }>;
    const user = rows.find((row) => row.role === 'user');
    expect(user?.content).toBe(starterCanonical('ask-question'));
    expect(JSON.parse(user?.meta ?? '{}')).toMatchObject({ starter: 'ask-question' });

    const system = captured[0]?.messages[0]?.content ?? '';
    const last = captured[0]?.messages.at(-1);
    expect(system).toContain(starterInstruction('ask-question'));
    expect(system).toContain('Perfil pedagógico desta sessão');
    expect(last).toMatchObject({ role: 'user', content: starterCanonical('ask-question') });
  });

  it('recusa turno sem mensagem e sem starter', async () => {
    expect((await post(zetelId, {})).status).toBe(400);
    expect((await post(zetelId, { starter: 'inventado' })).status).toBe(400);
    expect((await post(zetelId, { starter: 'explain', userMessage: 'texto livre' })).status).toBe(400);
  });
});
