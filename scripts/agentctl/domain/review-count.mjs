import { assertReviewsAllowed } from './execution-profile.mjs';
import { StateMachineError } from './state-machine.mjs';

/**
 * Normaliza reviews_requested para task review/close.
 * @param {{
 *   raw: unknown,
 *   profile: 'FAST'|'STANDARD'|'FULL',
 *   reviewJustification?: unknown,
 * }} input
 */
export function normalizeReviewsRequested(input) {
  const { raw, profile, reviewJustification } = input;
  if (raw == null) {
    return defaultReviews(profile);
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new StateMachineError(
      `reviews_requested invalido: ${typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}.`,
      {
        guard: 'reviews',
        nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
      },
    );
  }
  if (typeof raw === 'string' && !/^-?\d+$/.test(raw.trim())) {
    throw new StateMachineError(`reviews_requested invalido: ${raw}.`, {
      guard: 'reviews',
      nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
    });
  }
  const converted = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(converted) || !Number.isInteger(converted) || converted < 0) {
    throw new StateMachineError(`reviews_requested invalido: ${String(raw)}.`, {
      guard: 'reviews',
      nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
    });
  }
  assertReviewsAllowed(
    profile,
    converted,
    typeof reviewJustification === 'string' ? reviewJustification : null,
  );
  return converted;
}

/** @param {'FAST'|'STANDARD'|'FULL'} profile */
function defaultReviews(profile) {
  if (profile === 'FAST') return 0;
  if (profile === 'STANDARD') return 1;
  return 2;
}
