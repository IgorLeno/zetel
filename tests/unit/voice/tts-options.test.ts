import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TTS_INSTRUCTIONS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_MODELS,
  TTS_TONE_PRESETS,
  TTS_VOICES,
  isTtsModel,
  isTtsVoice,
  matchTonePreset,
  ttsDefaultVoiceFor,
  ttsEndpointOf,
  ttsModelEntry,
  ttsModelSupportsInstructions,
  ttsProviderOf,
  ttsVoiceSupportedBy,
  ttsVoicesFor,
} from '@/lib/tts-options';
import * as openaiVoice from '@/lib/openai-voice';

const GEMINI = 'google/gemini-3.8-flash-tts';
const GEMINI_LITE = 'google/gemini-3.8-flash-lite-tts';
const GPT_AUDIO_MINI = 'openai/gpt-audio-mini';
const GEMINI_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

describe('opções de voz TTS', () => {
  it('lista os 3 modelos e as 13 vozes da OpenAI', () => {
    expect(TTS_MODELS.filter((m) => m.provider === 'openai').map((m) => m.id)).toEqual([
      'gpt-4o-mini-tts',
      'tts-1',
      'tts-1-hd',
    ]);
    expect(TTS_VOICES).toHaveLength(13);
    expect(isTtsModel(DEFAULT_TTS_MODEL)).toBe(true);
    expect(isTtsVoice(DEFAULT_TTS_VOICE)).toBe(true);
    expect(isTtsModel('gpt-9-tts')).toBe(false);
    expect(isTtsVoice('darth')).toBe(false);
  });

  it('vozes novas só existem no gpt-4o-mini-tts', () => {
    for (const voice of ['ballad', 'verse', 'marin', 'cedar']) {
      expect(ttsVoiceSupportedBy('gpt-4o-mini-tts', voice)).toBe(true);
      expect(ttsVoiceSupportedBy('tts-1', voice)).toBe(false);
      expect(ttsVoiceSupportedBy('tts-1-hd', voice)).toBe(false);
    }
    expect(ttsVoiceSupportedBy('tts-1', 'nova')).toBe(true);
    expect(ttsVoiceSupportedBy('gpt-4o-mini-tts', 'darth')).toBe(false);
  });

  it('cataloga o Gemini 3.8 Flash TTS no OpenRouter com 30 vozes e sem tom', () => {
    const entry = ttsModelEntry(GEMINI);
    expect(entry).toMatchObject({ provider: 'openrouter', supportsInstructions: false, defaultVoice: 'Kore' });
    expect(ttsVoicesFor(GEMINI)).toEqual(GEMINI_VOICES);
    expect(ttsDefaultVoiceFor(GEMINI)).toBe('Kore');
    expect(isTtsModel(GEMINI)).toBe(true);
    expect(ttsProviderOf(GEMINI)).toBe('openrouter');
    expect(ttsModelSupportsInstructions(GEMINI)).toBe(false);
    for (const voice of GEMINI_VOICES) {
      expect(isTtsVoice(voice)).toBe(true);
      expect(ttsVoiceSupportedBy(GEMINI, voice)).toBe(true);
      expect(ttsVoiceSupportedBy('gpt-4o-mini-tts', voice)).toBe(false);
    }
    expect(ttsVoiceSupportedBy(GEMINI, 'marin')).toBe(false);
    expect(ttsVoiceSupportedBy(GEMINI, 'kore')).toBe(false);
  });

  it('cataloga os modelos do OpenRouter na ordem da aba Voz', () => {
    expect(TTS_MODELS.filter((m) => m.provider === 'openrouter').map((m) => m.id)).toEqual([
      GPT_AUDIO_MINI,
      GEMINI_LITE,
      GEMINI,
    ]);
  });

  it('Gemini 3.8 Flash Lite TTS: mesmas 30 vozes, sem tom, via /audio/speech', () => {
    expect(ttsModelEntry(GEMINI_LITE)).toMatchObject({
      provider: 'openrouter',
      endpoint: 'speech',
      supportsInstructions: false,
      defaultVoice: 'Kore',
    });
    expect(ttsVoicesFor(GEMINI_LITE)).toEqual(GEMINI_VOICES);
    expect(ttsVoiceSupportedBy(GEMINI_LITE, 'marin')).toBe(false);
  });

  it('GPT Audio Mini: chat com saída de áudio, aceita tom, 9 vozes OpenAI', () => {
    expect(ttsModelEntry(GPT_AUDIO_MINI)).toMatchObject({
      provider: 'openrouter',
      endpoint: 'chat-audio',
      supportsInstructions: true,
      defaultVoice: 'marin',
    });
    expect(ttsVoicesFor(GPT_AUDIO_MINI)).toEqual([
      'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'marin', 'cedar',
    ]);
    expect(ttsEndpointOf(GPT_AUDIO_MINI)).toBe('chat-audio');
    expect(ttsModelSupportsInstructions(GPT_AUDIO_MINI)).toBe(true);
    for (const voice of ['fable', 'nova', 'onyx', 'verse', 'Kore']) {
      expect(ttsVoiceSupportedBy(GPT_AUDIO_MINI, voice)).toBe(false);
    }
  });

  it('todo modelo tem voz padrão entre as suas vozes; fora do catálogo vale speech', () => {
    for (const m of TTS_MODELS) expect(m.voices).toContain(m.defaultVoice);
    expect(ttsEndpointOf(GEMINI)).toBe('speech');
    expect(ttsEndpointOf('gpt-4o-mini-tts')).toBe('speech');
    expect(ttsEndpointOf('custom-tts-model')).toBe('speech');
  });

  it('modelos OpenAI mantêm vozes e tom; fora do catálogo vale a regra antiga da OpenAI', () => {
    expect(ttsProviderOf('gpt-4o-mini-tts')).toBe('openai');
    expect(ttsProviderOf('custom-tts-model')).toBe('openai');
    expect(ttsModelEntry('custom-tts-model')).toBeUndefined();
    expect(ttsVoicesFor('gpt-4o-mini-tts')).toHaveLength(13);
    expect(ttsVoicesFor('tts-1')).not.toContain('marin');
    expect(ttsDefaultVoiceFor('gpt-4o-mini-tts')).toBe(DEFAULT_TTS_VOICE);
    expect(ttsModelSupportsInstructions('custom-tts-model')).toBe(true);
    expect(ttsModelSupportsInstructions('tts-1-custom')).toBe(false);
    expect(ttsVoiceSupportedBy('custom-tts-model', 'cedar')).toBe(true);
    expect(ttsVoiceSupportedBy('custom-tts-model', 'Kore')).toBe(false);
  });

  it('presets: o primeiro é o tom padrão e todos cabem no limite', () => {
    expect(TTS_TONE_PRESETS[0].instructions).toBe(DEFAULT_TTS_INSTRUCTIONS);
    for (const p of TTS_TONE_PRESETS) expect(p.instructions.length).toBeLessThanOrEqual(2000);
    expect(matchTonePreset(` ${DEFAULT_TTS_INSTRUCTIONS} `)).toBe('calmo');
    expect(matchTonePreset('algo meu')).toBeNull();
  });

  it('openai-voice re-exporta os mesmos padrões', () => {
    expect(openaiVoice.DEFAULT_TTS_MODEL).toBe(DEFAULT_TTS_MODEL);
    expect(openaiVoice.DEFAULT_TTS_INSTRUCTIONS).toBe(DEFAULT_TTS_INSTRUCTIONS);
  });
});
