import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/settings', () => ({ getSetting: (key: string) => settings.get(key) ?? null }));
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger }));
vi.mock('@/lib/config', () => ({ getVoiceKey: () => null }));

const { POST } = await import('@/app/api/voice/tts/route');
const { DEFAULT_TTS_INSTRUCTIONS, ttsModelSupportsInstructions } = await import('@/lib/openai-voice');

const fetchMock = vi.fn();

function ttsRequest(body: unknown): Request {
  return new Request('http://localhost/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sentPayload(): Promise<Record<string, unknown>> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  settings.clear();
  logger.info.mockReset();
  logger.error.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('mp3', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/voice/tts', () => {
  it('usa gpt-4o-mini-tts, marin e a instrução padrão sem configuração', async () => {
    const res = await POST(ttsRequest({ text: 'Olá.' }));
    expect(res.status).toBe(200);
    expect(await sentPayload()).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Olá.',
      instructions: DEFAULT_TTS_INSTRUCTIONS,
    });
  });

  it('usa a instrução, o modelo e a voz salvos', async () => {
    settings.set('tts_instructions', 'Fale devagar.');
    settings.set('tts_model', 'custom-tts-model');
    settings.set('tts_voice', 'cedar');
    await POST(ttsRequest({ text: 'Olá.' }));
    expect(await sentPayload()).toMatchObject({
      model: 'custom-tts-model',
      voice: 'cedar',
      instructions: 'Fale devagar.',
    });
  });

  it.each(['tts-1', 'tts-1-hd'])('omite instructions para %s', async (model) => {
    settings.set('tts_model', model);
    await POST(ttsRequest({ text: 'Olá.' }));
    const payload = await sentPayload();
    expect(payload.model).toBe(model);
    expect(payload).not.toHaveProperty('instructions');
  });

  it('loga só a contagem de caracteres', async () => {
    settings.set('tts_instructions', 'instrução secreta');
    await POST(ttsRequest({ text: 'Conteúdo do usuário.' }));
    expect(logger.info).toHaveBeenCalledWith('voice tts', { chars: 20 });
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secreta|Conteúdo/);
  });
});

describe('ttsModelSupportsInstructions', () => {
  it('distingue a família tts-1 dos modelos gpt-4o-*-tts', () => {
    expect(ttsModelSupportsInstructions('tts-1')).toBe(false);
    expect(ttsModelSupportsInstructions('tts-1-hd')).toBe(false);
    expect(ttsModelSupportsInstructions('gpt-4o-mini-tts')).toBe(true);
  });
});
