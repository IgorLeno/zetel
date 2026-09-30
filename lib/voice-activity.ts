/**
 * Detecção local de fala para barge-in (SPEC-003). Puro: recebe quadros de
 * RMS e decide quando a fala do usuário é sustentada o bastante para
 * interromper a parceira. Nenhum áudio sai daqui — só números.
 */

export interface VoiceActivityConfig {
  /** Janela inicial em que o piso de ruído (incluindo eco residual) é medido. */
  calibrationMs: number;
  /** Limiar = piso × fator. Conservador para não disparar com o próprio TTS. */
  thresholdFactor: number;
  /** Limiar nunca fica abaixo disto (sala silenciosa + AGC amplificando ruído). */
  minThreshold: number;
  /** Piso é limitado aqui: fala durante a calibração não trava o detector. */
  maxNoiseFloor: number;
  /** Fala acima do limiar por pelo menos este tempo dispara. */
  minSpeechMs: number;
  /** Queda curta entre sílabas que não zera a fala acumulada. */
  maxGapMs: number;
}

export const DEFAULT_VOICE_ACTIVITY_CONFIG: VoiceActivityConfig = {
  calibrationMs: 300,
  thresholdFactor: 3,
  minThreshold: 0.03,
  maxNoiseFloor: 0.06,
  minSpeechMs: 300,
  maxGapMs: 120,
};

export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export interface VoiceActivityDetector {
  /** Alimenta um quadro; devolve true uma única vez quando a fala se sustenta. */
  push(rms: number, dtMs: number): boolean;
  /** Recomeça a calibração e zera a fala acumulada (novo turno). */
  reset(): void;
  readonly threshold: number | null;
}

export function createVoiceActivityDetector(
  overrides: Partial<VoiceActivityConfig> = {},
): VoiceActivityDetector {
  const config = { ...DEFAULT_VOICE_ACTIVITY_CONFIG, ...overrides };
  let calibratedMs = 0;
  let calibrationSum = 0;
  let calibrationFrames = 0;
  let threshold: number | null = null;
  let speechMs = 0;
  let gapMs = 0;
  let fired = false;

  function reset(): void {
    calibratedMs = 0;
    calibrationSum = 0;
    calibrationFrames = 0;
    threshold = null;
    speechMs = 0;
    gapMs = 0;
    fired = false;
  }

  function push(rms: number, dtMs: number): boolean {
    if (fired || !Number.isFinite(rms) || !(dtMs > 0)) return false;

    if (threshold === null) {
      calibrationSum += rms;
      calibrationFrames += 1;
      calibratedMs += dtMs;
      if (calibratedMs >= config.calibrationMs) {
        const floor = Math.min(calibrationSum / calibrationFrames, config.maxNoiseFloor);
        threshold = Math.max(floor * config.thresholdFactor, config.minThreshold);
      }
      return false;
    }

    if (rms >= threshold) {
      speechMs += dtMs;
      gapMs = 0;
    } else if (speechMs > 0) {
      gapMs += dtMs;
      if (gapMs > config.maxGapMs) {
        speechMs = 0;
        gapMs = 0;
      }
    }

    if (speechMs >= config.minSpeechMs) {
      fired = true;
      return true;
    }
    return false;
  }

  return {
    push,
    reset,
    get threshold() {
      return threshold;
    },
  };
}
