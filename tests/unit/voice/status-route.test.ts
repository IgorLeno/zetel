import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasVoiceKey = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/lib/openai-voice', () => ({ hasVoiceKey }));

const { GET } = await import('@/app/api/voice/status/route');

describe('GET /api/voice/status', () => {
  beforeEach(() => {
    hasVoiceKey.mockReset();
  });

  it('separa TTS da chave e não reporta o microfone do navegador', async () => {
    hasVoiceKey.mockReturnValue(true);
    const body = await (await GET()).json() as { tts: boolean; sttServer: boolean; stt?: boolean };
    expect(body).toEqual({ tts: true, sttServer: true });
    expect(body.stt).toBeUndefined();
  });

  it('responde falso sem chave OpenAI', async () => {
    hasVoiceKey.mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({ tts: false, sttServer: false });
  });
});
