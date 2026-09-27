import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFile, processPdfFiles } from '@/lib/ingestao-service';
import { listMessages } from '@/lib/chat-service';
import { streamChat } from '@/lib/openrouter';
import { createZetel } from '@/lib/zetel-service';
import { extractConceptSuggestion, CONCEPT_MARK_START, CONCEPT_MARK_END } from '@/lib/chat-prompt';
import { findConcept, listConcepts, normalizeConceptName, parseConceptMarkdown } from '@/lib/concepts-service';
import { threePagePdf } from '@/tests/helpers/pdf-fixture';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({ env: null as TempEnv | null }));
vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn((key: string) => key === 'vault_path' ? state.env!.vaultPath : null),
  setSetting: vi.fn(), deleteSetting: vi.fn(),
}));
vi.mock('@/lib/config', () => ({ getOpenRouterModel: () => 'test/model' }));
vi.mock('@/lib/openrouter', () => ({ readApiKey: vi.fn(() => 'test-key'), streamChat: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const chatRoute = await import('@/app/api/zetels/[id]/chat/route');
const conceptRoute = await import('@/app/api/zetels/[id]/concepts/route');
const mockedStream = vi.mocked(streamChat);

function request(path: string, body: unknown, method = 'POST'): Request {
  return new Request(`http://localhost${path}`, { method,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function sentinel(name: string, user: string, source = 'S1', partner = 'Função de estado.') {
  return `${CONCEPT_MARK_START}${JSON.stringify({ nome: name, aliases: [],
    formulacao_parceira: partner, trecho_usuario: user, fontes: [source],
    justificativa: 'INTERNO' })}${CONCEPT_MARK_END}`;
}

describe('conceitos confirmados com fonte do turno', () => {
  let zetelId: string;
  let slug: string;
  let fileId: string;
  let conceptDir: string;

  beforeEach(async () => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Termodinâmica');
    zetelId = zetel.id;
    slug = zetel.slug;
    conceptDir = join(state.env.vaultPath, 'zetels', slug, 'conceitos');
    const source = join(state.env.vaultPath, 'termo.pdf');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(source, threePagePdf());
    fileId = addFile(state.env.db, state.env.vaultPath, zetelId, source).id;
    await processPdfFiles(state.env.db, state.env.vaultPath, zetelId);
    mockedStream.mockReset();
  });

  afterEach(() => { cleanupTempEnv(state.env!); state.env = null; });

  async function turn(userMessage: string, output: string, sessionId?: string) {
    mockedStream.mockImplementationOnce(async function* () {
      for (const part of [output.slice(0, 8), output.slice(8, 22), output.slice(22)]) yield part;
    });
    const res = await chatRoute.POST(request(`/api/zetels/${zetelId}/chat`, {
      userMessage, focus: { fileId, pageNumber: 2 }, ...(sessionId ? { sessionId } : {}),
    }), { params: Promise.resolve({ id: zetelId }) });
    const sse = await res.text();
    const line = sse.split('\n').find((item) => item.startsWith('data: [CONCEPT_SUGGESTION] '));
    return { res, sse, event: line
      ? JSON.parse(line.slice('data: [CONCEPT_SUGGESTION] '.length)) as
        { messageId: string; sourceLabel: string; existing: { slug: string } | null } : null };
  }

  it('retém o bloco, exige Salvar, reconstrói proveniência e acrescenta sem apagar o passado', async () => {
    const text = 'Entalpia é a energia do sistema.';
    const first = await turn(text, `Explicação. ${sentinel('Entalpia', text)}`);
    expect(first.res.status).toBe(200);
    expect(first.event).toMatchObject({ sourceLabel: 'termo.pdf · p. 2', existing: null });
    expect(first.sse).not.toContain('INTERNO');
    expect(first.sse).not.toContain(CONCEPT_MARK_START);
    expect(existsSync(conceptDir)).toBe(false);
    const firstMessage = listMessages(state.env!.db, zetelId).at(-1)!;
    expect(firstMessage.meta?.conceptSuggestion?.sourceId).toBe('S1');
    const sessionId = firstMessage.sessionId;

    const created = await conceptRoute.POST(request(`/api/zetels/${zetelId}/concepts`, {
      messageId: first.event!.messageId, action: 'create', name: 'Entalpia',
      fileId: 'forjado', pageNumber: 999, contentHash: 'forjado', sessionId: 'forjado',
    }), { params: Promise.resolve({ id: zetelId }) });
    expect(created.status).toBe(200);
    const file = join(conceptDir, 'entalpia.md');
    const original = readFileSync(file, 'utf8');
    expect(parseConceptMarkdown(original, 'entalpia')?.nome).toBe('Entalpia');
    expect(original).toContain(text);
    expect(original).not.toContain('forjado');
    const provenance = JSON.parse(original.match(/<!-- zetel:prov (.+) -->/)![1]) as Record<string, unknown>;
    const page = state.env!.db.prepare('SELECT content_hash FROM pdf_pages WHERE file_id = ? AND page_number = 2')
      .get(fileId) as { content_hash: string };
    expect(provenance).toMatchObject({ zetel_id: zetelId, session_id: sessionId,
      message_id: first.event!.messageId, file_id: fileId, page: 2,
      content_hash: page.content_hash, source_id: 'S1' });

    const again = 'Entalpia relaciona energia e trabalho.';
    const second = await turn(again, `Outro turno. ${sentinel('ENTALPIA', again,
      'S1', 'A entalpia evolui com o estado.')}`, sessionId);
    expect(second.event?.existing?.slug).toBe('entalpia');
    const appended = await conceptRoute.POST(request(`/api/zetels/${zetelId}/concepts`, {
      messageId: second.event!.messageId, action: 'append', conceptSlug: 'entalpia',
      name: 'ENTALPIA',
    }), { params: Promise.resolve({ id: zetelId }) });
    expect(appended.status).toBe(200);
    const current = readFileSync(file, 'utf8');
    expect(current).toContain(text);
    expect(current).toContain(again);
    expect(current).toContain('A entalpia evolui com o estado.');
    expect((current.match(/<!-- zetel:prov/g) ?? [])).toHaveLength(2);
    expect(readdirSync(conceptDir)).toEqual(['entalpia.md']);
  });

  it('rejeita fala e fonte inventadas, mensagem alheia e Ignorar não cria arquivo', async () => {
    expect(extractConceptSuggestion(sentinel('Entalpia', 'fala inventada'),
      'fala verdadeira', ['S1'])).toBeNull();
    expect(extractConceptSuggestion(sentinel('Entalpia', 'fala verdadeira', 'S99'),
      'fala verdadeira', ['S1'])).toBeNull();
    const ignored = await turn('Calor é transferência de energia.',
      `Texto. ${sentinel('Calor', 'Calor é transferência de energia.')}`);
    expect(ignored.event).not.toBeNull();
    const other = createZetel(state.env!.db, state.env!.vaultPath, 'Outro');
    const foreign = await conceptRoute.POST(request(`/api/zetels/${other.id}/concepts`, {
      messageId: ignored.event!.messageId, action: 'create',
    }), { params: Promise.resolve({ id: other.id }) });
    expect(foreign.status).toBe(404);
    const message = listMessages(state.env!.db, zetelId).at(-1)!;
    const patch = await chatRoute.PATCH(request(`/api/zetels/${zetelId}/chat`, {
      messageId: ignored.event!.messageId, sessionId: message.sessionId,
      rejected: true, kind: 'concept',
    }, 'PATCH'), { params: Promise.resolve({ id: zetelId }) });
    expect(patch.status).toBe(200);
    expect(listMessages(state.env!.db, zetelId).at(-1)?.meta?.conceptRejected).toBe(true);
    const saveRejected = await conceptRoute.POST(request(`/api/zetels/${zetelId}/concepts`, {
      messageId: ignored.event!.messageId, action: 'create',
    }), { params: Promise.resolve({ id: zetelId }) });
    expect(saveRejected.status).toBe(404);
    expect(existsSync(conceptDir)).toBe(false);
  });

  it('normaliza nome e alias e parseia o Markdown salvo', () => {
    expect(normalizeConceptName(' ENTALPIA ')).toBe(normalizeConceptName('entalpia'));
    expect(findConcept([{ slug: 'entalpia', nome: 'Entalpia', aliases: ['H'] }], 'h')?.slug)
      .toBe('entalpia');
    expect(parseConceptMarkdown('---\nnome: "Entalpia"\naliases: "H; Energia"\n---\n', 'x'))
      .toMatchObject({ nome: 'Entalpia', aliases: ['H', 'Energia'] });
  });
});
