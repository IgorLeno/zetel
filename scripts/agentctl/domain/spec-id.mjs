import { StateMachineError } from './state-machine.mjs';

const SAFE_SPEC_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

/** @param {unknown} specId */
export function assertSafeSpecId(specId) {
  if (
    typeof specId !== 'string' ||
    !SAFE_SPEC_ID.test(specId) ||
    specId.includes('..') ||
    specId.includes('/') ||
    specId.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(specId)
  ) {
    throw new StateMachineError('spec id invalido.', {
      guard: 'spec-id',
      nextAction: 'Use letras, numeros e hifens, por exemplo SPEC-000-agent-workflow-pilot.',
    });
  }
  return specId;
}
