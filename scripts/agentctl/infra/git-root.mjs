import { spawnSync } from 'node:child_process';
import { StateMachineError } from '../domain/state-machine.mjs';

/**
 * Resolve o root do repositorio via Git; nunca usa caminho absoluto fixo.
 * @param {string} [cwd]
 */
export function resolveGitRoot(cwd = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new StateMachineError(
      `Guarda violada: diretorio nao e um repositorio Git (${cwd}).`,
      {
        guard: 'git-root',
        nextAction: 'Execute agentctl dentro de um clone Git do projeto.',
      },
    );
  }

  return result.stdout.trim();
}
