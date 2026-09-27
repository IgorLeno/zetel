import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '@/lib/migrate';
import { createZetel } from '@/lib/zetel-service';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { streamChat, type StreamChatParams } from '@/lib/openrouter';

const state = vi.hoisted(() => ({ env: null as TempEnv | null }));
vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(() => null) }));
vi.mock('@/lib/config', () => ({ getOpenRouterModel: () => 'test/model' }));
vi.mock('@/lib/openrouter', () => ({
  readApiKey: vi.fn(() => 'test-key'), streamChat: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sessionsRoute = await import('@/app/api/zetels/[id]/sessions/route');
const chatRoute = await import('@/app/api/zetels/[id]/chat/route');
const mockedStream = vi.mocked(streamChat);
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(
  handler: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  zetelId: string,
  method: Method,
  body?: Record<string, unknown>,
  query = '',
) {
  return handler(new Request(`http://localhost/api/zetels/${zetelId}/${query ? `chat${query}` : 'sessions'}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }), { params: Promise.resolve({ id: zetelId }) });
}

describe('migration 007 sobre histórico legado', () => {
  it('faz backfill atômico com foco PDF e Markdown e preserva cascades', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const dir = join(process.cwd(), 'migrations');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.startsWith('007_')).sort()) {
      db.exec(readFileSync(join(dir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
        .run(name, '2026-09-01T00:00:00.000Z');
    }
    const z = db.prepare(
      `INSERT INTO zetels (id, slug, display_name, created_at, updated_at)
       VALUES (?, ?, ?, '2026-09-01', '2026-09-01')`,
    );
    z.run('z1', 'um', 'Um');
    z.run('z2', 'dois', 'Dois');
    z.run('z3', 'tres', 'Três');
    z.run('z4', 'quatro', 'Quatro');
    db.prepare(
      `INSERT INTO zetel_files (id, zetel_id, filename, created_at, updated_at, page_count, extraction_status)
       VALUES ('pdf-1', 'z1', 'Livro.pdf', '2026-09-01', '2026-09-01', 3, 'ok')`,
    ).run();
    const m = db.prepare(
      `INSERT INTO chat_messages (id, zetel_id, role, content, page_index, model, created_at, meta)
       VALUES (?, ?, 'user', 'texto', ?, 'model', ?, ?)`,
    );
    m.run('a', 'z1', null, '2026-09-01T10:00:00.000Z', null);
    m.run('b', 'z1', null, '2026-09-02T10:00:00.000Z',
      JSON.stringify({ focusFileId: 'pdf-1', focusPageNumber: 3, selectionVerified: true }));
    m.run('d', 'z1', null, '2026-09-02T11:00:00.000Z', '{meta inválido');
    m.run('g', 'z1', null, '2026-09-02T12:00:00.000Z',
      JSON.stringify({ focusFileId: 'pdf-1', focusPageNumber: 99 }));
    m.run('c', 'z2', 7, '2026-09-03T10:00:00.000Z', null);
    m.run('e', 'z3', 5, '2026-09-04T10:00:00.000Z',
      JSON.stringify({ focusFileId: 'pdf-1', focusPageNumber: 2 }));
    m.run('f', 'z4', null, '2026-09-05T10:00:00.000Z',
      JSON.stringify({ focusFileId: 'missing', focusPageNumber: 1 }));
    runMigrations(db);
    const rows = db.prepare('SELECT * FROM study_sessions ORDER BY id').all() as Array<{
      id: string; title: string; status: string; focus: string; created_at: string; last_active_at: string;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ id: 'legacy-z1', title: 'Histórico anterior',
      status: 'paused', created_at: '2026-09-01T10:00:00.000Z',
      last_active_at: '2026-09-02T12:00:00.000Z' });
    expect(JSON.parse(rows[0].focus)).toEqual({ scope: 'page', fileId: 'pdf-1', pageNumber: 3 });
    expect(JSON.parse(rows[1].focus)).toEqual({ scope: 'page', fileId: null, pageNumber: 7 });
    expect(JSON.parse(rows[2].focus)).toEqual({ scope: 'page', fileId: null, pageNumber: 5 });
    expect(rows[3].focus).toBeNull();
    expect(db.prepare('SELECT DISTINCT session_id FROM chat_messages WHERE zetel_id = ?')
      .all('z1')).toEqual([{ session_id: 'legacy-z1' }]);
    db.prepare('DELETE FROM study_sessions WHERE id = ?').run('legacy-z1');
    expect(db.prepare('SELECT count(*) AS n FROM chat_messages WHERE zetel_id = ?')
      .get('z1')).toEqual({ n: 0 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  });
});

describe('sessões e chat escopado', () => {
  let z1: string;
  let z2: string;
  let captured: StreamChatParams[];

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    z1 = createZetel(state.env.db, state.env.vaultPath, 'Um').id;
    z2 = createZetel(state.env.db, state.env.vaultPath, 'Dois').id;
    captured = [];
    mockedStream.mockReset();
    mockedStream.mockImplementation(async function* (params) {
      captured.push(params);
      yield 'Resposta';
    });
    const now = new Date().toISOString();
    state.env.db.prepare(
      `INSERT INTO zetel_pages (zetel_id, page_index, heading, anchor, content_text, content_hash, created_at)
       VALUES (?, 0, 'Página', 'p0', 'Conteúdo', 'hash', ?)`,
    ).run(z1, now);
    state.env.db.prepare(
      `INSERT INTO zetel_files (id, zetel_id, filename, created_at, updated_at, page_count, extraction_status)
       VALUES ('pdf1', ?, 'Livro.pdf', ?, ?, 3, 'ok')`,
    ).run(z1, now, now);
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  async function create(zetelId = z1, body: Record<string, unknown> = {}) {
    const res = await call(sessionsRoute.POST, zetelId, 'POST', body);
    expect(res.status).toBe(201);
    return (await res.json() as { session: { id: string; status: string; title: string } }).session;
  }

  it('cria, lista, pausa anterior, renomeia, persiste foco/perfil e arquiva', async () => {
    const first = await create(z1, { focus: { scope: 'page', fileId: 'pdf1', pageNumber: 2 } });
    expect(first.title).toMatch(/^Livro · p\. 2 · \d\d\/\d\d\/\d{4}$/);
    const second = await create();
    const list = await call(sessionsRoute.GET, z1, 'GET');
    const sessions = (await list.json() as { sessions: Array<{ id: string; status: string }> }).sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.id === first.id)?.status).toBe('paused');
    expect(sessions.find((s) => s.id === second.id)?.status).toBe('active');
    const patch = await call(sessionsRoute.PATCH, z1, 'PATCH', {
      sessionId: first.id, title: 'Meu estudo', profileId: 'professor-socratico',
      profileOverrides: { pace: 2 }, focus: { scope: 'page', fileId: null, pageNumber: 0 },
      status: 'active',
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).session).toMatchObject({ title: 'Meu estudo',
      profileId: 'professor-socratico', profileOverrides: { pace: 2 },
      focus: { scope: 'page', fileId: null, pageNumber: 0 }, status: 'active' });
    expect((await (await call(chatRoute.GET, z1, 'GET', undefined, '?')).json()).sessionId)
      .toBe(first.id);
    expect((await call(sessionsRoute.PATCH, z1, 'PATCH', {
      sessionId: first.id, status: 'archived',
    })).status).toBe(200);
    expect((await call(chatRoute.POST, z1, 'POST', {
      sessionId: first.id, userMessage: 'Não enviar',
    })).status).toBe(409);
    expect(mockedStream).not.toHaveBeenCalled();
    expect((await call(sessionsRoute.PATCH, z2, 'PATCH', {
      sessionId: second.id, title: 'Outro',
    })).status).toBe(404);
  });

  it('rejeita PDF alheio ou página fora do page_count no PATCH', async () => {
    const session = await create();
    for (const focus of [
      { scope: 'page', fileId: 'pdf1', pageNumber: 4 },
      { scope: 'page', fileId: 'pdf1', pageNumber: 0 },
      { scope: 'page', fileId: 'missing', pageNumber: 1 },
      { scope: 'page', fileId: 'pdf1', pageNumber: 1, selectionText: 'não guardar' },
    ]) {
      expect((await call(sessionsRoute.PATCH, z1, 'PATCH', {
        sessionId: session.id, focus,
      })).status).toBe(400);
    }
    expect((await call(sessionsRoute.PATCH, z2, 'PATCH', {
      sessionId: session.id, focus: { scope: 'page', fileId: 'pdf1', pageNumber: 1 },
    })).status).toBe(404);
    const valid = await call(sessionsRoute.PATCH, z1, 'PATCH', {
      sessionId: session.id, focus: { scope: 'page', fileId: 'pdf1', pageNumber: 3 },
    });
    expect(valid.status).toBe(200);
    expect((await valid.json()).session.focus).toEqual({
      scope: 'page', fileId: 'pdf1', pageNumber: 3,
    });
  });

  it('isola histórico, contexto do LLM, limpeza e PATCH por Zetel/sessão', async () => {
    const a = await create();
    const send = async (sessionId: string, userMessage: string) => {
      const res = await call(chatRoute.POST, z1, 'POST', { sessionId, userMessage });
      expect(res.status).toBe(200);
      await res.text();
    };
    await send(a.id, 'Pergunta A exclusiva');
    const b = await create();
    await send(b.id, 'Pergunta B exclusiva');
    expect(captured[1].messages.map((m) => m.content).join('\n')).not.toContain('Pergunta A exclusiva');
    const getA = await call(chatRoute.GET, z1, 'GET', undefined,
      `?sessionId=${encodeURIComponent(a.id)}`);
    const aMessages = (await getA.json() as { messages: Array<{ id: string; content: string }> }).messages;
    expect(aMessages).toHaveLength(2);
    expect(aMessages[0].content).toBe('Pergunta A exclusiva');
    const getLatest = await call(chatRoute.GET, z1, 'GET', undefined, '?');
    const latest = (await getLatest.json() as { sessionId: string; messages: unknown[] });
    expect(latest.sessionId).toBe(b.id);
    expect(latest.messages).toHaveLength(2);
    expect((await call(chatRoute.DELETE, z1, 'DELETE', undefined, '?')).status).toBe(400);
    expect((await call(chatRoute.PATCH, z2, 'PATCH', {
      messageId: aMessages[1].id, rejected: true,
    })).status).toBe(404);
    expect((await call(chatRoute.PATCH, z1, 'PATCH', {
      messageId: aMessages[1].id, sessionId: b.id, rejected: true,
    })).status).toBe(404);
    expect((await call(chatRoute.PATCH, z1, 'PATCH', {
      messageId: aMessages[1].id, sessionId: a.id, rejected: true,
    })).status).toBe(200);
    expect((await call(chatRoute.DELETE, z1, 'DELETE', undefined,
      `?sessionId=${encodeURIComponent(a.id)}`)).status).toBe(200);
    expect((await (await call(chatRoute.GET, z1, 'GET', undefined,
      `?sessionId=${encodeURIComponent(a.id)}`)).json()).messages).toHaveLength(0);
    expect((await (await call(chatRoute.GET, z1, 'GET', undefined,
      `?sessionId=${encodeURIComponent(b.id)}`)).json()).messages).toHaveLength(2);
    expect((await call(chatRoute.GET, z2, 'GET', undefined,
      `?sessionId=${encodeURIComponent(b.id)}`)).status).toBe(404);
    expect((await call(chatRoute.DELETE, z2, 'DELETE', undefined,
      `?sessionId=${encodeURIComponent(b.id)}`)).status).toBe(404);
    expect(state.env!.db.prepare('SELECT count(*) AS n FROM study_sessions WHERE id = ?')
      .get(a.id)).toEqual({ n: 1 });
  });

  it('aceita cliente legado sem sessionId e cria uma sessão apenas no POST', async () => {
    const empty = await call(chatRoute.GET, z1, 'GET', undefined, '?');
    expect((await empty.json()).messages).toEqual([]);
    expect(state.env!.db.prepare('SELECT count(*) AS n FROM study_sessions').get()).toEqual({ n: 0 });
    const sent = await call(chatRoute.POST, z1, 'POST', { userMessage: 'Legado' });
    expect(sent.status).toBe(200);
    const createdSessionId = sent.headers.get('X-Study-Session-Id');
    expect(createdSessionId).toBeTruthy();
    await sent.text();
    const messages = (await (await call(chatRoute.GET, z1, 'GET', undefined, '?')).json()).messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].sessionId).toBeTruthy();
    expect(messages[0].sessionId).toBe(messages[1].sessionId);
    expect(messages[0].sessionId).toBe(createdSessionId);
    const reused = await call(chatRoute.POST, z1, 'POST', { userMessage: 'Legado 2' });
    expect(reused.status).toBe(200);
    await reused.text();
    expect(state.env!.db.prepare('SELECT count(*) AS n FROM study_sessions').get()).toEqual({ n: 1 });
  });

  it('rejeita corpo JSON nulo antes de tentar ownership ou escrita', async () => {
    for (const method of ['PATCH', 'POST'] as const) {
      const handler = method === 'PATCH' ? chatRoute.PATCH : chatRoute.POST;
      const res = await handler(new Request(`http://localhost/api/zetels/${z1}/chat`, {
        method, headers: { 'Content-Type': 'application/json' }, body: 'null',
      }), { params: Promise.resolve({ id: z1 }) });
      expect(res.status).toBe(400);
    }
    expect(state.env!.db.prepare('SELECT count(*) AS n FROM chat_messages').get())
      .toEqual({ n: 0 });
  });
});
