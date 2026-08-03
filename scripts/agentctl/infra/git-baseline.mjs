import { spawnSync } from 'node:child_process';
import { StateMachineError } from '../domain/state-machine.mjs';

const GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

/**
 * Politica A: o lifecycle so opera em repositorio com ao menos um commit.
 * Nao cria commit e nao oferece suporte a unborn HEAD.
 * @param {string} root
 * @returns {string} SHA de HEAD
 */
export function assertInitialCommit(root) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });

  if (result.error || result.status !== 0 || result.signal) {
    throwGitBaseline();
  }

  const sha = String(result.stdout ?? '').trim();
  if (!sha || !GIT_SHA.test(sha)) {
    throwGitBaseline();
  }

  return sha;
}

function throwGitBaseline() {
  throw new StateMachineError(
    'O lifecycle exige um commit Git inicial para fingerprints, evidencias e fixed points.',
    {
      guard: 'git-baseline',
      nextAction:
        'Crie ao menos um commit inicial no repositorio antes de usar `agentctl task next/start/validate/close`.',
    },
  );
}
