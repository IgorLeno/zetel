import { dirname } from 'node:path';
import { toPosixRelative } from '../domain/evidence.mjs';
import { assertApprovedIntegrity } from '../domain/spec-approval-guard.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { StateMachineError } from '../domain/state-machine.mjs';
import { selectNextReadyTask } from '../domain/task-selection.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

/**
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runTaskNext(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const specId = parseSpecId(args);
    const { root, path, state, validation } = loadSpecState(specId, { cwd: io.cwd });
    if (!validation.ok) {
      throw new StateMachineError(validation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija state.json antes de consultar a proxima tarefa.',
      });
    }
    // Mesma guarda de task start: APPROVED + integrity valida (rejeita LEGACY/TAMPERED).
    assertApprovedIntegrity(path, state);

    const selection = selectNextReadyTask(state, { specDir: dirname(path) });
    if (!selection.ok || !selection.task) {
      const details = describeNoReady(selection);
      throw new StateMachineError(`Nenhuma tarefa READY elegivel. ${details}`, {
        guard: 'no-ready-task',
        nextAction: details,
      });
    }

    const task = selection.task;
    const relativeTaskFile = selection.taskFile
      ? toPosixRelative(selection.taskFile, root)
      : 'null';

    stdout.write([
      `spec_id: ${specId}`,
      `task_id: ${task.id}`,
      `task_status: ${task.status}`,
      `blocked_by: ${JSON.stringify(task.blocked_by ?? [])}`,
      `execution_profile: ${task.execution_profile ?? 'null'}`,
      `task_file: ${relativeTaskFile}`,
      'next_action: Execute ./agentctl task start com agente, perfil e justificativa.',
      '',
    ].join('\n'));
    return 0;
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseSpecId(args) {
  const [specId, ...rest] = args;
  if (!specId || specId.startsWith('--') || rest.length > 0) {
    throw new StateMachineError('Uso: ./agentctl task next <spec-id>.', {
      guard: 'usage',
      nextAction: 'Informe exatamente um spec-id.',
    });
  }
  assertSafeSpecId(specId);
  return specId;
}

/** @param {any} selection */
function describeNoReady(selection) {
  if (selection.finished) return 'Spec concluida: nao ha tarefas restantes.';
  if (selection.blocked?.length) {
    return `Existem tarefas bloqueadas: ${selection.blocked.map((item) => item.id).join(', ')}.`;
  }
  if (selection.drafts?.length) {
    return `Existem drafts nao liberados: ${selection.drafts.map((item) => item.id).join(', ')}.`;
  }
  return 'Nenhum candidato READY desbloqueado.';
}
