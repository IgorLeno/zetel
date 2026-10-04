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
  ttsVoiceSupportedBy,
} from '@/lib/tts-options';
import * as openaiVoice from '@/lib/openai-voice';

describe('opções de voz TTS', () => {
  it('lista os 3 modelos e as 13 vozes da OpenAI', () => {
    expect(TTS_MODELS.map((m) => m.id)).toEqual(['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd']);
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
