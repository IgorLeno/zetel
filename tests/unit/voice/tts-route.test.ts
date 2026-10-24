import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/settings', () => ({ getSetting: (key: string) => settings.get(key) ?? null }));
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger }));
const openRouterKey = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/config', () => ({
  getVoiceKey: () => null,
  resolveOpenRouterCredential: () => ({
    configured: Boolean(openRouterKey.value),
    source: openRouterKey.value ? 'config' : null,
    key: openRouterKey.value,
  }),
}));

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
  openRouterKey.value = null;
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

  it('usa modelo, voz e instrução do corpo sem tocar em settings (amostra)', async () => {
    settings.set('tts_instructions', 'Salva.');
    await POST(ttsRequest({ text: 'Olá.', model: 'gpt-4o-mini-tts', voice: 'coral', instructions: ' Do corpo. ' }));
    expect(await sentPayload()).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'coral',
      instructions: 'Do corpo.',
    });
  });

  it.each([
    [{ model: 'gpt-9-tts' }],
    [{ voice: 'darth' }],
    [{ model: 'tts-1', voice: 'marin' }],
    [{ instructions: 42 }],
    [{ instructions: 'a'.repeat(2001) }],
  ])('rejeita corpo inválido %j com 400 sem chamar a OpenAI', async (extra) => {
    const res = await POST(ttsRequest({ text: 'Olá.', ...extra }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não loga a instrução do corpo', async () => {
    await POST(ttsRequest({ text: 'Olá.', instructions: 'instrução secreta' }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secreta/);
  });

  it('loga só a contagem de caracteres', async () => {
    settings.set('tts_instructions', 'instrução secreta');
    await POST(ttsRequest({ text: 'Conteúdo do usuário.' }));
    expect(logger.info).toHaveBeenCalledWith('voice tts', {
      chars: 20,
      provider: 'openai',
      model: 'gpt-4o-mini-tts',
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secreta|Conteúdo/);
  });
});

describe('POST /api/voice/tts com erro da OpenAI', () => {
  it('502 genérico e log sem o corpo de erro upstream', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'corpo upstream sigiloso' } }, { status: 500 }));
    const res = await POST(ttsRequest({ text: 'Olá.' }));
    expect(res.status).toBe(502);
    expect(logger.error).toHaveBeenCalledWith('voice tts failed', {
      provider: 'openai',
      model: 'gpt-4o-mini-tts',
      status: 500,
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/sigiloso/);
  });
});

const GEMINI = 'google/gemini-3.8-flash-tts';
const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/audio/speech';

describe('POST /api/voice/tts com modelo do OpenRouter', () => {
  beforeEach(() => {
    openRouterKey.value = 'sk-or-test';
  });

  it('roteia o modelo salvo ao OpenRouter sem tom e responde audio/wav', async () => {
    settings.set('tts_model', GEMINI);
    settings.set('tts_voice', 'Puck');
    settings.set('tts_instructions', 'Tom salvo.');
    const res = await POST(ttsRequest({ text: 'Olá.' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/wav');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_TTS_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    expect(await sentPayload()).toEqual({
      model: GEMINI,
      input: 'Olá.',
      voice: 'Puck',
      response_format: 'pcm',
    });
  });

  it('ignora instructions do corpo sem erro (amostra)', async () => {
    const res = await POST(ttsRequest({ text: 'Olá.', model: GEMINI, voice: 'Kore', instructions: 'Fale rindo.' }));
    expect(res.status).toBe(200);
    expect(await sentPayload()).not.toHaveProperty('instructions');
  });

  it('valida a voz contra o modelo do corpo', async () => {
    expect((await POST(ttsRequest({ text: 'Olá.', model: GEMINI, voice: 'marin' }))).status).toBe(400);
    expect((await POST(ttsRequest({ text: 'Olá.', model: 'gpt-4o-mini-tts', voice: 'Kore' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 sem chave OpenRouter, sem chamar a rede, mesmo com chave OpenAI', async () => {
    openRouterKey.value = null;
    settings.set('tts_model', GEMINI);
    settings.set('tts_voice', 'Kore');
    const res = await POST(ttsRequest({ text: 'Olá.' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'tts_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('modelo OpenAI não depende da chave OpenRouter', async () => {
    openRouterKey.value = null;
    const res = await POST(ttsRequest({ text: 'Olá.', model: 'gpt-4o-mini-tts', voice: 'coral' }));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/speech');
  });

  it('erro upstream vira 502 genérico e loga só provider, model e status', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: 'corpo upstream sigiloso' } }, { status: 429 }),
    );
    settings.set('tts_instructions', 'instrução secreta');
    const res = await POST(ttsRequest({ text: 'Conteúdo do usuário.', model: GEMINI, voice: 'Kore' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Não foi possível sintetizar áudio. Tente novamente.' });
    expect(logger.error).toHaveBeenCalledWith('voice tts failed', {
      provider: 'openrouter',
      model: GEMINI,
      status: 429,
    });
    expect(logger.info).toHaveBeenCalledWith('voice tts', { chars: 20, provider: 'openrouter', model: GEMINI });
    const logged = JSON.stringify([logger.info.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toMatch(/sigiloso|secreta|Conteúdo|sk-or/);
  });
});

const GPT_AUDIO_MINI = 'openai/gpt-audio-mini';
const GEMINI_LITE = 'google/gemini-3.8-flash-lite-tts';

function audioSse(...pcmChunks: Uint8Array[]): Response {
  const lines = pcmChunks.map(
    (c) => `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: Buffer.from(c).toString('base64') } } }] })}`,
  );
  return new Response(`${lines.join('\n\n')}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('POST /api/voice/tts com os modelos novos do OpenRouter', () => {
  beforeEach(() => {
    openRouterKey.value = 'sk-or-test';
  });

  it('Flash Lite vai ao /audio/speech como o Flash', async () => {
    const res = await POST(ttsRequest({ text: 'Olá.', model: GEMINI_LITE, voice: 'Leda' }));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(OPENROUTER_TTS_URL);
    expect(await sentPayload()).toEqual({ model: GEMINI_LITE, input: 'Olá.', voice: 'Leda', response_format: 'pcm' });
  });

  it('GPT Audio Mini vai ao chat com áudio, leva o tom e responde WAV', async () => {
    fetchMock.mockResolvedValue(audioSse(new Uint8Array([1, 2]), new Uint8Array([3, 4])));
    settings.set('tts_model', GPT_AUDIO_MINI);
    settings.set('tts_voice', 'coral');
    settings.set('tts_instructions', 'Tom salvo.');
    const res = await POST(ttsRequest({ text: 'Olá.' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/wav');
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const payload = await sentPayload();
    expect(payload).toMatchObject({
      model: GPT_AUDIO_MINI,
      modalities: ['text', 'audio'],
      audio: { voice: 'coral', format: 'pcm16' },
      stream: true,
    });
    const messages = payload.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Tom salvo.');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Olá.' });
    const wav = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(wav.subarray(44))).toEqual([1, 2, 3, 4]);
  });

  it('GPT Audio Mini rejeita voz de outro modelo', async () => {
    expect((await POST(ttsRequest({ text: 'Olá.', model: GPT_AUDIO_MINI, voice: 'Kore' }))).status).toBe(400);
    expect((await POST(ttsRequest({ text: 'Olá.', model: GPT_AUDIO_MINI, voice: 'nova' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GPT Audio Mini sem áudio no stream vira 502 genérico', async () => {
    fetchMock.mockResolvedValue(audioSse());
    const res = await POST(ttsRequest({ text: 'Olá.', model: GPT_AUDIO_MINI, voice: 'marin' }));
    expect(res.status).toBe(502);
    expect(logger.error).toHaveBeenCalledWith('voice tts failed', {
      provider: 'openrouter',
      model: GPT_AUDIO_MINI,
      status: 502,
    });
  });
});

describe('ttsModelSupportsInstructions', () => {
  it('distingue a família tts-1 dos modelos gpt-4o-*-tts', () => {
    expect(ttsModelSupportsInstructions('tts-1')).toBe(false);
    expect(ttsModelSupportsInstructions('tts-1-hd')).toBe(false);
    expect(ttsModelSupportsInstructions('gpt-4o-mini-tts')).toBe(true);
  });
});
