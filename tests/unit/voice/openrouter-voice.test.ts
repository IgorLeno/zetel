import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const credential = vi.hoisted(() => ({ key: null as string | null }));
vi.mock('@/lib/config', () => ({
  resolveOpenRouterCredential: () => ({
    configured: Boolean(credential.key),
    source: credential.key ? 'config' : null,
    key: credential.key,
  }),
}));

const {
  chatAudioSystemPrompt,
  collectChatAudio,
  hasOpenRouterVoiceKey,
  pcmSampleRate,
  pcmToWav,
  readOpenRouterVoiceKey,
  synthesizeSpeechOpenRouter,
  synthesizeSpeechOpenRouterChatAudio,
  transcriptMatchesText,
} = await import('@/lib/openrouter-voice');

const sseLine = (event: unknown) => `data: ${JSON.stringify(event)}`;
const audioDelta = (bytes: number[]) =>
  sseLine({ choices: [{ delta: { audio: { data: Buffer.from(bytes).toString('base64') } } }] });

const transcriptDelta = (transcript: string) =>
  sseLine({ choices: [{ delta: { audio: { transcript } } }] });
const sseResponse = (...lines: string[]) =>
  new Response([...lines, 'data: [DONE]'].join('\n\n'), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  credential.key = null;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openrouter-voice', () => {
  it('reporta a chave pelo resolvedor existente sem lançar', () => {
    expect(hasOpenRouterVoiceKey()).toBe(false);
    expect(readOpenRouterVoiceKey()).toBeNull();
    credential.key = 'sk-or-test';
    expect(hasOpenRouterVoiceKey()).toBe(true);
    expect(readOpenRouterVoiceKey()).toBe('sk-or-test');
  });

  it('chama /audio/speech com Bearer, pcm e sem instructions; embrulha em WAV', async () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
    fetchMock.mockResolvedValue(new Response(pcm, { status: 200, headers: { 'Content-Type': 'audio/pcm' } }));
    const res = await synthesizeSpeechOpenRouter({
      apiKey: 'sk-or-test',
      text: 'Olá.',
      voice: 'Kore',
      model: 'google/gemini-3.8-flash-tts',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/wav');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'google/gemini-3.8-flash-tts',
      input: 'Olá.',
      voice: 'Kore',
      response_format: 'pcm',
    });
    const wav = new Uint8Array(await res.arrayBuffer());
    expect(wav).toHaveLength(44 + pcm.length);
    expect(Array.from(wav.subarray(44))).toEqual(Array.from(pcm));
  });

  it('pcmToWav: cabeçalho RIFF/WAVE PCM 16-bit mono com a taxa informada', () => {
    const wav = pcmToWav(new Uint8Array(10), 24000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const ascii = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4));
    expect(ascii(0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 10);
    expect(ascii(8)).toBe('WAVE');
    expect(ascii(12)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(10);
  });

  it.each([
    ['audio/pcm', 24000],
    ['audio/L16;rate=16000', 16000],
    ['audio/pcm; rate=44100; channels=1', 44100],
    [null, 24000],
  ])('pcmSampleRate(%s) = %i', (contentType, rate) => {
    expect(pcmSampleRate(contentType)).toBe(rate);
  });

  it('erro upstream lança só com o status, sem corpo nem chave', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: 'detalhe upstream sk-or-test Olá.' } }, { status: 429 }),
    );
    const err = await synthesizeSpeechOpenRouter({
      apiKey: 'sk-or-test',
      text: 'Olá.',
      voice: 'Kore',
      model: 'google/gemini-3.8-flash-tts',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { status?: number }).status).toBe(429);
    expect((err as Error).message).toBe('OpenRouter TTS: 429');
    expect((err as Error).message).not.toMatch(/detalhe|sk-or|Olá/);
  });

  it('collectChatAudio junta áudio e transcrição; ignora comentários e [DONE]', () => {
    const sse = [
      ': OPENROUTER PROCESSING',
      sseLine({ choices: [{ delta: { role: 'assistant' } }] }),
      audioDelta([1, 2]),
      transcriptDelta('Olá'),
      audioDelta([3]),
      transcriptDelta(', Igor.'),
      'data: {quebrado',
      'data: [DONE]',
    ].join('\n\n');
    const { pcm, transcript } = collectChatAudio(sse);
    expect(Array.from(pcm)).toEqual([1, 2, 3]);
    expect(transcript).toBe('Olá, Igor.');
  });

  it('collectChatAudio: erro no meio do stream lança só status genérico', () => {
    const sse = [audioDelta([1]), sseLine({ error: { message: 'detalhe sigiloso' } })].join('\n');
    const err = (() => {
      try {
        collectChatAudio(sse);
      } catch (e) {
        return e;
      }
    })();
    expect((err as Error).message).toBe('OpenRouter TTS: 502');
  });

  it('chatAudioSystemPrompt pede leitura literal e anexa o tom só quando há', () => {
    expect(chatAudioSystemPrompt(undefined)).toMatch(/exatamente/);
    expect(chatAudioSystemPrompt(undefined)).not.toMatch(/Como falar/);
    expect(chatAudioSystemPrompt('  Calmo.  ')).toMatch(/Como falar: Calmo\.$/);
  });

  it('transcriptMatchesText aceita leitura literal e rejeita resposta à frase', () => {
    expect(transcriptMatchesText('Oi, Igor! 😊', 'Oi, Igor!')).toBe(true);
    expect(transcriptMatchesText('Ótimo — é isso.', 'otimo, e isso')).toBe(true);
    expect(transcriptMatchesText('Por onde começamos?', '')).toBe(true);
    expect(
      transcriptMatchesText('Oi, Igor! 😊', 'Oi, Igor! Tudo bem? Como posso te ajudar hoje?'),
    ).toBe(false);
    expect(
      transcriptMatchesText('Por onde começamos?', 'Vamos começar pelo primeiro capítulo, que tal?'),
    ).toBe(false);
  });

  it('chat com áudio: few-shot de leitura e WAV quando a transcrição bate', async () => {
    fetchMock.mockResolvedValue(sseResponse(audioDelta([1, 2]), transcriptDelta('Oi, Igor!')));
    const res = await synthesizeSpeechOpenRouterChatAudio({
      apiKey: 'sk-or-test',
      text: 'Oi, Igor!',
      voice: 'marin',
      model: 'openai/gpt-audio-mini',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(body.messages[1].content).toBe(body.messages[2].content);
    expect(body.messages[3].content).toBe('Oi, Igor!');
    expect(res.headers.get('Content-Type')).toBe('audio/wav');
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBe(44 + 2);
  });

  it('chat com áudio: fala divergente tenta de novo e usa a leitura correta', async () => {
    fetchMock
      .mockResolvedValueOnce(
        sseResponse(audioDelta([9, 9, 9]), transcriptDelta('Oi! Tudo bem? Como posso te ajudar hoje?')),
      )
      .mockResolvedValueOnce(sseResponse(audioDelta([1, 2]), transcriptDelta('Oi, Igor!')));
    const res = await synthesizeSpeechOpenRouterChatAudio({
      apiKey: 'sk-or-test',
      text: 'Oi, Igor!',
      voice: 'marin',
      model: 'openai/gpt-audio-mini',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()).slice(44))).toEqual([1, 2]);
  });

  it('chat com áudio: divergência persistente lança 502 em vez de tocar a resposta', async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse(audioDelta([9]), transcriptDelta('Vamos começar pelo primeiro capítulo, que tal?')),
    );
    const err = await synthesizeSpeechOpenRouterChatAudio({
      apiKey: 'sk-or-test',
      text: 'Por onde começamos?',
      voice: 'marin',
      model: 'openai/gpt-audio-mini',
    }).catch((e: unknown) => e);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((err as Error & { status?: number }).status).toBe(502);
  });

  it('chat com áudio: erro HTTP lança só o status', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'sk-or-test' } }, { status: 400 }));
    const err = await synthesizeSpeechOpenRouterChatAudio({
      apiKey: 'sk-or-test',
      text: 'Olá.',
      voice: 'marin',
      model: 'openai/gpt-audio-mini',
    }).catch((e: unknown) => e);
    expect((err as Error & { status?: number }).status).toBe(400);
    expect((err as Error).message).not.toMatch(/sk-or/);
  });
});
