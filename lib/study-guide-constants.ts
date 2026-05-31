/** Limites configuráveis do Guia de Estudo (Configurações → Limites de Geração). */

export const DEFAULT_STUDY_GUIDE_MAX_TOKENS = 16000;
export const STUDY_GUIDE_MAX_TOKENS_MIN = 4000;
export const STUDY_GUIDE_MAX_TOKENS_MAX = 32000;

export const DEFAULT_STUDY_GUIDE_TIMEOUT_S = 120;
export const STUDY_GUIDE_TIMEOUT_S_MIN = 30;
export const STUDY_GUIDE_TIMEOUT_S_MAX = 300;

export function clampStudyGuideMaxTokens(raw: number, fallback = DEFAULT_STUDY_GUIDE_MAX_TOKENS): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(STUDY_GUIDE_MAX_TOKENS_MAX, Math.max(STUDY_GUIDE_MAX_TOKENS_MIN, Math.trunc(raw)));
}

export function clampStudyGuideTimeoutS(raw: number, fallback = DEFAULT_STUDY_GUIDE_TIMEOUT_S): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(STUDY_GUIDE_TIMEOUT_S_MAX, Math.max(STUDY_GUIDE_TIMEOUT_S_MIN, Math.trunc(raw)));
}
