import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseState, validateState, StateMachineError } from '../domain/state-machine.mjs';
import { resolveGitRoot } from './git-root.mjs';

/**
 * @param {string} specId
 * @param {{ cwd?: string }} [options]
 */
export function loadSpecState(specId, options = {}) {
  if (typeof specId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(specId)) {
    throw new StateMachineError('spec id invalido.', {
      guard: 'spec-id',
      nextAction: 'Use um id seguro, por exemplo SPEC-000-agent-workflow-pilot.',
    });
  }

  const root = resolveGitRoot(options.cwd);
  const path = join(root, '.agent', 'specs', specId, 'state.json');

  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      throw new StateMachineError(`state.json nao encontrado para ${specId}.`, {
        guard: 'state-missing',
        nextAction: `Crie .agent/specs/${specId}/state.json ou confira o id.`,
      });
    }
    throw error;
  }

  const state = parseState(raw);
  const validation = validateState(state);
  return { root, path, state, validation, raw };
}
