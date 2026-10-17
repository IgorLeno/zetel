import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_VOICE,
  LIVE_MAX_SECONDS,
  LIVE_MODEL,
  LIVE_VOICES,
  LIVE_WARN_SECONDS,
  isLiveVoice,
} from '@/lib/live-options';
import { GEMINI_TTS_VOICES } from '@/lib/tts-options';

describe('opções do modo Live', () => {
  it('fixa modelo e limites aprovados (D3, D6)', () => {
    expect(LIVE_MODEL).toBe('gemini-3.8-live');
    expect(LIVE_MAX_SECONDS).toBe(900);
    expect(LIVE_WARN_SECONDS).toBe(780);
  });

  it('reusa as 30 vozes Gemini e usa Kore por padrão (D10)', () => {
    expect(LIVE_VOICES).toEqual(GEMINI_TTS_VOICES);
    expect(LIVE_VOICES).toHaveLength(30);
    expect(DEFAULT_LIVE_VOICE).toBe('Kore');
    expect(isLiveVoice('Kore')).toBe(true);
    expect(isLiveVoice('kore')).toBe(false);
    expect(isLiveVoice('marin')).toBe(false);
  });
});
