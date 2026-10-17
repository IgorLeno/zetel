import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasVoiceKey = vi.hoisted(() => vi.fn(() => false));
const hasOpenRouterVoiceKey = vi.hoisted(() => vi.fn(() => false));
const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/openai-voice', () => ({ hasVoiceKey }));
vi.mock('@/lib/openrouter-voice', () => ({ hasOpenRouterVoiceKey }));
const geminiConfigured = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/settings', () => ({ getSetting: (key: string) => settings.get(key) ?? null }));
vi.mock('@/lib/config', () => ({
  resolveGeminiCredential: () => ({ configured: geminiConfigured.value, source: null, key: null }),
}));

const { GET } = await import('@/app/api/voice/status/route');

describe('GET /api/voice/status', () => {
  beforeEach(() => {
    hasVoiceKey.mockReset();
    hasOpenRouterVoiceKey.mockReset();
    settings.clear();
    geminiConfigured.value = false;
  });

  it('separa TTS da chave e não reporta o microfone do navegador', async () => {
    hasVoiceKey.mockReturnValue(true);
    const body = await (await GET()).json() as { tts: boolean; sttServer: boolean; stt?: boolean };
    expect(body).toEqual({ tts: true, sttServer: true, providers: { openai: true, openrouter: false }, live: false });
    expect(body.stt).toBeUndefined();
  });

  it('responde falso sem chave OpenAI', async () => {
    hasVoiceKey.mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({
      tts: false,
      sttServer: false,
      providers: { openai: false, openrouter: false },
      live: false,
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
      live: false,
    });

    hasVoiceKey.mockReturnValue(true);
    hasOpenRouterVoiceKey.mockReturnValue(false);
    expect(await (await GET()).json()).toMatchObject({ tts: false, sttServer: true });
  });

  it('live segue só a chave Gemini (SPEC-016 RF3)', async () => {
    geminiConfigured.value = true;
    expect(await (await GET()).json()).toMatchObject({ live: true, tts: false, sttServer: false });
  });
});
