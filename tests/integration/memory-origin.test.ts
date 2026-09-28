import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMessage, saveMessage } from '@/lib/chat-service';
import { listMemories } from '@/lib/memory-service';
import { createStudySession } from '@/lib/study-session-service';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({ env: null as TempEnv | null }));
vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({
  getSetting: (key: string) => key === 'vault_path' ? state.env!.vaultPath : null,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const memoryRoute = await import('@/app/api/memory/route');

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/memory', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('origem de memória sugerida', () => {
  beforeEach(() => { state.env = makeTempEnv(); });
  afterEach(() => { cleanupTempEnv(state.env!); state.env = null; });

  it('valida Zetel e papel antes de gravar e marca somente a mensagem de origem', async () => {
    const { db, vaultPath } = state.env!;
    const first = createZetel(db, vaultPath, 'Primeiro');
    const other = createZetel(db, vaultPath, 'Outro');
    const session = createStudySession(db, first.id);
    const assistant = saveMessage(db, { zetelId: first.id, sessionId: session.id,
      role: 'assistant', content: 'Uma ideia', pageIndex: null, model: 'test/model' });
    const user = saveMessage(db, { zetelId: first.id, sessionId: session.id,
      role: 'user', content: 'Pergunta', pageIndex: null, model: 'test/model' });
    const base = { titulo: 'Ideia', corpo: 'Lembrar desta ideia.' };

    const foreign = await memoryRoute.POST(request({ ...base, zetelOrigem: other.id,
      messageId: assistant.id }));
    expect(foreign.status).toBe(404);
    const wrongRole = await memoryRoute.POST(request({ ...base, zetelOrigem: first.id,
      messageId: user.id }));
    expect(wrongRole.status).toBe(404);
    expect(listMemories(vaultPath)).toHaveLength(0);
    expect(getMessage(db, first.id, assistant.id)?.meta?.suggestedMemory).toBeUndefined();

    const saved = await memoryRoute.POST(request({ ...base, zetelOrigem: first.id,
      modelo: 'forjado', messageId: assistant.id }));
    expect(saved.status).toBe(200);
    expect(listMemories(vaultPath)).toMatchObject([{ zetelOrigem: first.slug }]);
    const { path } = await saved.json() as { path: string };
    expect(readFileSync(join(vaultPath, path), 'utf8')).toContain('modelo: test/model');
    expect(getMessage(db, first.id, assistant.id)?.meta?.suggestedMemory).toBe(true);
    expect(getMessage(db, first.id, user.id)?.meta?.suggestedMemory).toBeUndefined();
  });
});
