import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isTaskBlockedByDependencies, StateMachineError } from './state-machine.mjs';

const IGNORED_FOR_NEXT = new Set([
  'DRAFT',
  'IN_PROGRESS',
  'VALIDATING',
  'REVIEWING',
  'BLOCKED',
  'DONE',
  'PUSHED',
  'SESSION_CLOSED',
]);

/**
 * Seleciona a proxima tarefa READY elegivel na ordem canonica do array.
 * @param {{ tasks: Array<{ id: string, status: string, blocked_by?: string[], execution_profile?: string }> }} state
 * @param {{ specDir: string }} options
 */
export function selectNextReadyTask(state, options) {
  if (!Array.isArray(state.tasks)) {
    throw new StateMachineError('tasks deve ser array.', {
      guard: 'schema',
      nextAction: 'Corrija state.json antes de consultar a proxima tarefa.',
    });
  }

  /** @type {Array<{ id: string, status: string, blocked_by: string[], reason: string }>} */
  const blocked = [];
  /** @type {Array<{ id: string, status: string }>} */
  const drafts = [];
  /** @type {Array<{ id: string, status: string }>} */
  const closed = [];

  for (const task of state.tasks) {
    if (!task || typeof task.id !== 'string') continue;
    if (task.status === 'DRAFT') {
      drafts.push({ id: task.id, status: task.status });
      continue;
    }
    if (task.status === 'READY') {
      const deps = Array.isArray(task.blocked_by) ? task.blocked_by : [];
      if (!deps.every((depId) => dependencyClosed(state.tasks, depId))) {
        blocked.push({
          id: task.id,
          status: task.status,
          blocked_by: deps,
          reason: 'blocked_by incompleto',
        });
        continue;
      }
      if (isTaskBlockedByDependencies(task, state.tasks)) {
        blocked.push({
          id: task.id,
          status: task.status,
          blocked_by: deps,
          reason: 'dependencia nao SESSION_CLOSED',
        });
        continue;
      }
      return {
        ok: true,
        task,
        taskFile: resolveTaskFile(options.specDir, task.id),
        blocked,
        drafts,
        closed,
      };
    }
    if (IGNORED_FOR_NEXT.has(task.status)) {
      if (task.status === 'DONE' || task.status === 'PUSHED' || task.status === 'SESSION_CLOSED') {
        closed.push({ id: task.id, status: task.status });
      }
    }
  }

  const finished = drafts.length === 0 && blocked.length === 0
    && state.tasks.every((task) =>
      task.status === 'DONE' || task.status === 'PUSHED' || task.status === 'SESSION_CLOSED');

  return {
    ok: false,
    task: null,
    taskFile: null,
    blocked,
    drafts,
    closed,
    finished,
  };
}

/**
 * @param {Array<{ id: string, status: string }>} tasks
 * @param {string} depId
 */
function dependencyClosed(tasks, depId) {
  const dep = tasks.find((item) => item.id === depId);
  return Boolean(dep && dep.status === 'SESSION_CLOSED');
}

/**
 * @param {string} specDir
 * @param {string} taskId
 */
export function resolveTaskFile(specDir, taskId) {
  const tasksDir = join(specDir, 'tasks');
  let entries = [];
  try {
    entries = readdirSync(tasksDir);
  } catch {
    return null;
  }
  const match = entries
    .filter((name) => name.endsWith('.md') && (name === `${taskId}.md` || name.startsWith(`${taskId}-`)))
    .sort();
  return match[0] ? join(tasksDir, match[0]) : null;
}
