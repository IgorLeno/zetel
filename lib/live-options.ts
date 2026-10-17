import { GEMINI_TTS_VOICES } from './tts-options';

/**
 * Opções do modo Live (SPEC-016 D3, D6, D10): módulo puro, seguro para o
 * cliente. Modelo e limites conferidos na doc do Gemini Live em 2026-10-17;
 * trocar de modelo = mudar só esta constante.
 */

export const LIVE_MODEL = 'gemini-3.8-live';

/** Teto por sessão Live (D6): 15 min sem compressão de contexto. */
export const LIVE_MAX_SECONDS = 15 * 60;
/** Aviso de fim próximo aos 13 min (D6). */
export const LIVE_WARN_SECONDS = 13 * 60;

/** As vozes nativas do Live são as mesmas do Gemini TTS (doc, 2026-10-17). */
export const LIVE_VOICES = GEMINI_TTS_VOICES;
export const DEFAULT_LIVE_VOICE = 'Kore';

export function isLiveVoice(voice: string): boolean {
  return (LIVE_VOICES as readonly string[]).includes(voice);
}
