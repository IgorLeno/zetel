import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { streamChat, type StreamChatParams } from '@/lib/openrouter';

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

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

describe('chat interrompido', () => {
  let zetelId: string;

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    zetelId = createZetel(state.env.db, state.env.vaultPath, 'Voz').id;
    mockedStream.mockReset();
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  it('persiste a narrativa parcial com meta.interrupted ao abortar o stream', async () => {
    mockedStream.mockImplementation(async function* (params: StreamChatParams) {
      yield 'Texto parcial antes de parar. O restante desta frase existe só para ultrapassar o retentor da sentinela.';
      await new Promise<void>((_resolve, reject) => {
        if (!params.signal) {
          reject(new Error('signal ausente'));
          return;
        }
        const fail = () => reject(abortError());
        if (params.signal.aborted) fail();
        else params.signal.addEventListener('abort', fail, { once: true });
      });
    });

    const ac = new AbortController();
    const res = await POST(new Request(`http://localhost/api/zetels/${zetelId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Explique entalpia.' }),
      signal: ac.signal,
    }), { params: Promise.resolve({ id: zetelId }) });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    try {
      const first = await reader.read();
      raw += decoder.decode(first.value);
      expect(raw).toContain('Texto parcial');
    } finally {
      ac.abort();
    }
    while (true) {
      const next = await reader.read().catch(() => ({ done: true as const, value: undefined }));
      if (next.done) break;
    }

    const rows = state.env!.db.prepare(
      `SELECT role, content, meta FROM chat_messages WHERE zetel_id = ? ORDER BY created_at ASC`,
    ).all(zetelId) as Array<{ role: string; content: string; meta: string | null }>;
    const assistant = rows.find((row) => row.role === 'assistant');
    expect(assistant?.content).toContain('Texto parcial antes de parar.');
    expect(JSON.parse(assistant?.meta ?? '{}')).toMatchObject({ interrupted: true });
  });

  it('não marca interrupted quando o stream termina', async () => {
    mockedStream.mockImplementation(async function* () {
      yield 'Resposta completa.';
    });
    const res = await POST(new Request(`http://localhost/api/zetels/${zetelId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'Olá.' }),
    }), { params: Promise.resolve({ id: zetelId }) });
    await res.text();
    const rows = state.env!.db.prepare(
      `SELECT role, meta FROM chat_messages WHERE zetel_id = ? AND role = 'assistant'`,
    ).all(zetelId) as Array<{ meta: string | null }>;
    expect(JSON.parse(rows[0]?.meta ?? '{}').interrupted).toBeUndefined();
  });
});
