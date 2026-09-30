import {
  createVoiceActivityDetector,
  type VoiceActivityConfig,
} from '@/lib/voice-activity';

/**
 * Controlador de barge-in (SPEC-003). Sem DOM: a fonte de microfone, o relógio
 * e o timer são injetados, para que o ciclo de vida (abrir, medir, disparar,
 * fechar) seja testável em node.
 */

export type BargeInVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'stopped' | 'error';

export function shouldArmBargeIn(input: {
  enabled: boolean;
  micAtivo: boolean;
  autoPlay: boolean;
  voiceState: BargeInVoiceState;
}): boolean {
  return input.enabled && input.micAtivo && input.autoPlay &&
    (input.voiceState === 'thinking' || input.voiceState === 'speaking');
}

export interface MicLevelSource {
  sampleRms(): number;
  close(): void;
}

export interface BargeInDeps {
  openSource: () => Promise<MicLevelSource>;
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  onBargeIn: () => void;
  onError?: () => void;
  frameMs?: number;
  detector?: Partial<VoiceActivityConfig>;
}

export interface BargeInController {
  /** Abre o mic e começa a medir. Idempotente enquanto armado. */
  arm(): void;
  /** Fecha tracks/contexto e para de medir. Idempotente. */
  disarm(): void;
  /** Primeira fala da parceira no turno: recalibra com o eco real presente. */
  noteSpeakingStarted(): void;
  readonly armed: boolean;
}

export function createBargeInController(deps: BargeInDeps): BargeInController {
  const frameMs = deps.frameMs ?? 50;
  const detector = createVoiceActivityDetector(deps.detector);
  let armed = false;
  // Cada arm/disarm invalida aberturas de mic ainda pendentes.
  let generation = 0;
  let source: MicLevelSource | null = null;
  let timer: unknown = null;
  let lastAt = 0;
  let recalibratedForSpeech = false;

  function stopMeasuring(): void {
    if (timer !== null) {
      deps.clearInterval(timer);
      timer = null;
    }
    if (source) {
      const open = source;
      source = null;
      open.close();
    }
  }

  function tick(): void {
    if (!source) return;
    const now = deps.now();
    const dt = now - lastAt;
    lastAt = now;
    if (!detector.push(source.sampleRms(), dt)) return;
    // Fecha o mic antes de avisar: o Web Speech reabre a captura em seguida.
    disarm();
    deps.onBargeIn();
  }

  function arm(): void {
    if (armed) return;
    armed = true;
    recalibratedForSpeech = false;
    const token = ++generation;
    detector.reset();
    deps.openSource().then(
      (opened) => {
        if (token !== generation) {
          opened.close();
          return;
        }
        source = opened;
        lastAt = deps.now();
        timer = deps.setInterval(tick, frameMs);
      },
      () => {
        if (token !== generation) return;
        armed = false;
        deps.onError?.();
      },
    );
  }

  function disarm(): void {
    generation += 1;
    armed = false;
    stopMeasuring();
  }

  function noteSpeakingStarted(): void {
    if (!armed || recalibratedForSpeech) return;
    recalibratedForSpeech = true;
    detector.reset();
  }

  return {
    arm,
    disarm,
    noteSpeakingStarted,
    get armed() {
      return armed;
    },
  };
}

/** Preferência `bargeIn` em `zetel_voice_prefs`; ausente ou ilegível = ligada (D4). */
export function readBargeInPref(raw: string | null): boolean {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return true;
    return (parsed as Record<string, unknown>).bargeIn !== false;
  } catch {
    return true;
  }
}
