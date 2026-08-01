import { loadSpecState } from '../infra/read-state.mjs';
import { findActiveTasks, isTaskBlockedByDependencies } from '../domain/state-machine.mjs';

/**
 * Comando somente leitura: apresenta status sem modificar arquivos.
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 * @returns {number} exit code
 */
export function runSpecStatus(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const specId = args[0];

  if (!specId) {
    stderr.write(
      'Uso: agentctl spec status <spec-id>\nProxima acao: informe o id da spec.\n',
    );
    return 2;
  }

  try {
    const { state, validation, path } = loadSpecState(specId, { cwd: io.cwd });

    if (!validation.ok) {
      stderr.write(`Estado invalido em ${path}\n`);
      for (const issue of validation.issues ?? []) {
        stderr.write(`- ${issue.message}\n`);
        stderr.write(`  guard: ${issue.guard}\n`);
        stderr.write(`  nextAction: ${issue.nextAction}\n`);
      }
      if (!validation.issues?.length) {
        for (const error of validation.errors) {
          stderr.write(`- ${error}\n`);
        }
      }
      stderr.write(
        'Proxima acao: corrija state.json via comandos agentctl; nao edite saltos manuais.\n',
      );
      return 1;
    }

    const active = findActiveTasks(state);
    const lines = [
      `spec: ${state.spec.id}`,
      `status: ${state.spec.status}`,
      `revision: ${state.revision}`,
      `active_task: ${state.active_task ?? '-'}`,
      `session: ${state.session?.status ?? '-'}`,
      'tasks:',
    ];

    for (const task of state.tasks) {
      const blocked = isTaskBlockedByDependencies(task, state.tasks);
      const flags = [];
      if (blocked) flags.push('blocked_by_deps');
      if (active.some((item) => item.id === task.id)) flags.push('active');
      const suffix = flags.length ? ` [${flags.join(', ')}]` : '';
      lines.push(`  - ${task.id}: ${task.status}${suffix}`);
    }

    stdout.write(`${lines.join('\n')}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const next =
      error && typeof error === 'object' && 'nextAction' in error
        ? String(/** @type {{ nextAction?: string }} */ (error).nextAction)
        : 'Verifique o estado e tente novamente.';
    stderr.write(`${message}\nProxima acao: ${next}\n`);
    return 1;
  }
}
