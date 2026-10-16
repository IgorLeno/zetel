import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasVoiceKey = vi.hoisted(() => vi.fn(() => false));
const hasOpenRouterVoiceKey = vi.hoisted(() => vi.fn(() => false));
const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/openai-voice', () => ({ hasVoiceKey }));
vi.mock('@/lib/openrouter-voice', () => ({ hasOpenRouterVoiceKey }));
vi.mock('@/lib/settings', () => ({ getSetting: (key: string) => settings.get(key) ?? null }));

const { GET } = await import('@/app/api/voice/status/route');

describe('GET /api/voice/status', () => {
  beforeEach(() => {
    hasVoiceKey.mockReset();
    hasOpenRouterVoiceKey.mockReset();
    settings.clear();
  });

  it('separa TTS da chave e não reporta o microfone do navegador', async () => {
    hasVoiceKey.mockReturnValue(true);
    const body = await (await GET()).json() as { tts: boolean; sttServer: boolean; stt?: boolean };
    expect(body).toEqual({ tts: true, sttServer: true, providers: { openai: true, openrouter: false } });
    expect(body.stt).toBeUndefined();
  });

  it('responde falso sem chave OpenAI', async () => {
    hasVoiceKey.mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({
      tts: false,
      sttServer: false,
      providers: { openai: false, openrouter: false },
    });
  });

  it('tts segue o provedor do modelo efetivo; sttServer segue a OpenAI', async () => {
    settings.set('tts_model', 'google/gemini-3.8-flash-tts');
    hasVoiceKey.mockReturnValue(false);
    hasOpenRouterVoiceKey.mockReturnValue(true);
    expect(await (await GET()).json()).toEqual({
      tts: true,
      sttServer: false,
      providers: { openai: false, openrouter: true },
    });

    hasVoiceKey.mockReturnValue(true);
    hasOpenRouterVoiceKey.mockReturnValue(false);
    expect(await (await GET()).json()).toMatchObject({ tts: false, sttServer: true });
  });
});
