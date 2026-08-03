import { dirname } from 'node:path';
import {
  assertReviewsAllowed,
  isExecutionProfile,
  resolveProfileChange,
} from '../domain/execution-profile.mjs';
import { assertApprovedIntegrity } from '../domain/spec-approval-guard.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import {
  ACTIVE_TASK_STATUSES,
  assertTransition,
  findActiveTasks,
  isTaskBlockedByDependencies,
  StateMachineError,
  validateState,
} from '../domain/state-machine.mjs';
import { updateOperationalFrontmatter } from '../domain/task-frontmatter.mjs';
import { resolveTaskFile } from '../domain/task-selection.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

/**
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runTaskStart(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseStartArgs(args);
    const { path, state, validation } = loadSpecState(parsed.specId, { cwd: io.cwd });
    if (!validation.ok) {
      throw new StateMachineError(validation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija o estado antes de iniciar a tarefa.',
      });
    }

    const active = findActiveTasks(state);
    if (active.length > 0 || state.active_task != null) {
      throw new StateMachineError(
        `Ja existe tarefa/sessao ativa (${state.active_task ?? active.map((item) => item.id).join(',')}).`,
        {
          guard: 'active-task',
          nextAction: 'Feche a tarefa ativa antes de iniciar outra.',
        },
      );
    }
    if (ACTIVE_TASK_STATUSES.includes(state.session?.status)) {
      throw new StateMachineError(`Sessao ativa em ${state.session.status}.`, {
        guard: 'active-session',
        nextAction: 'Encerre a sessao ativa antes de task start.',
      });
    }

    const task = state.tasks.find((item) => item.id === parsed.taskId);
    if (!task) {
      throw new StateMachineError(`Tarefa inexistente: ${parsed.taskId}.`, {
        guard: 'task-missing',
        nextAction: 'Informe um task-id presente em state.tasks.',
      });
    }
    if (task.status !== 'READY') {
      throw new StateMachineError(`Tarefa ${parsed.taskId} nao esta READY (${task.status}).`, {
        guard: 'task-status',
        nextAction: 'Libere a tarefa para READY antes de iniciar.',
      });
    }
    assertBlockersSessionClosed(task, state.tasks);

    // Resolve e valida o arquivo da tarefa antes de integridade/persistencia.
    const taskFile = resolveTaskFile(dirname(path), parsed.taskId);
    if (!taskFile) {
      throw new StateMachineError(`Arquivo da tarefa ${parsed.taskId} nao encontrado.`, {
        guard: 'task-file',
        nextAction: 'Crie tasks/<id>-*.md antes de iniciar a tarefa.',
      });
    }

    assertApprovedIntegrity(path, state);

    if (!isExecutionProfile(parsed.profile)) {
      throw new StateMachineError(`Perfil invalido: ${parsed.profile}.`, {
        guard: 'profile',
        nextAction: 'Use --profile FAST, STANDARD ou FULL.',
      });
    }

    const profileDecision = resolveProfileChange({
      current: task.execution_profile ?? null,
      next: parsed.profile,
      agent: parsed.agent,
      elevatedByAgent: task.profile_elevated_by ?? null,
      profileApprovedBy: parsed.profileApprovedBy,
      justification: parsed.justification,
    });

    assertReviewsAllowed(profileDecision.profile, parsed.reviews, parsed.reviewJustification);
    assertTransition('task', task.status, 'IN_PROGRESS', { task, tasks: state.tasks });

    const startedAt = new Date().toISOString();
    const day = startedAt.slice(0, 10).replaceAll('-', '');
    const nextTasks = state.tasks.map((item) => {
      if (item.id !== parsed.taskId) return item;
      return {
        ...item,
        status: 'IN_PROGRESS',
        execution_profile: profileDecision.profile,
        profile_justification: parsed.justification.trim(),
        ...(profileDecision.profileApprovedBy
          ? { profile_approved_by: profileDecision.profileApprovedBy }
          : {}),
        ...(profileDecision.elevatedByAgent
          ? { profile_elevated_by: profileDecision.elevatedByAgent }
          : {}),
        reviews_requested: parsed.reviews,
        ...(parsed.reviewJustification
          ? { review_justification: parsed.reviewJustification.trim() }
          : {}),
      };
    });

    const next = {
      ...state,
      active_task: parsed.taskId,
      tasks: nextTasks,
      session: {
        id: `task-${parsed.taskId}-${day}`,
        agent: parsed.agent,
        task_id: parsed.taskId,
        status: 'IN_PROGRESS',
        started_at: startedAt,
        execution_profile: profileDecision.profile,
        profile_justification: parsed.justification.trim(),
        reviews_requested: parsed.reviews,
        ...(parsed.reviewJustification
          ? { review_justification: parsed.reviewJustification.trim() }
          : {}),
        ...(profileDecision.profileApprovedBy
          ? { profile_approved_by: profileDecision.profileApprovedBy }
          : {}),
        ...(profileDecision.elevatedByAgent
          ? { profile_elevated_by: profileDecision.elevatedByAgent }
          : {}),
      },
    };

    const nextValidation = validateState(next);
    if (!nextValidation.ok) {
      throw new StateMachineError(nextValidation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija a transicao antes de persistir task start.',
      });
    }

    const written = writeJsonAtomic(path, next, { expectedRevision: state.revision });
    try {
      updateOperationalFrontmatter(taskFile, {
        status: 'IN_PROGRESS',
        execution_profile: profileDecision.profile,
        profile_justification: parsed.justification.trim(),
        ...(profileDecision.profileApprovedBy
          ? { profile_approved_by: profileDecision.profileApprovedBy }
          : {}),
      });
    } catch (error) {
      throw new StateMachineError(
        `Estado iniciado, mas frontmatter falhou: ${error instanceof Error ? error.message : String(error)}`,
        {
          guard: 'task-file',
          nextAction: 'Corrija o markdown da tarefa; o estado ja esta IN_PROGRESS e deve ser reconciliado antes de continuar.',
        },
      );
    }

    stdout.write([
      `task_started: ${parsed.taskId}`,
      `spec_id: ${parsed.specId}`,
      `agent: ${parsed.agent}`,
      `execution_profile: ${profileDecision.profile}`,
      `reviews_requested: ${parsed.reviews}`,
      `revision: ${written.revision}`,
      '',
    ].join('\n'));
    return 0;
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseStartArgs(args) {
  const [specId, taskId, ...flags] = args;
  if (!specId || !taskId || specId.startsWith('--') || taskId.startsWith('--')) {
    throw new StateMachineError(
      'Uso: ./agentctl task start <spec-id> <task-id> --agent <agent> --profile <FAST|STANDARD|FULL> --justification "<texto>" [--reviews <0|1|2>] [--review-justification "<texto>"] [--profile-approved-by "<id>"].',
      {
        guard: 'usage',
        nextAction: 'Informe spec-id, task-id, agente, perfil e justificativa.',
      },
    );
  }
  assertSafeSpecId(specId);

  /** @type {string | null} */
  let agent = null;
  /** @type {string | null} */
  let profile = null;
  /** @type {string | null} */
  let justification = null;
  /** @type {number | null} */
  let reviews = null;
  /** @type {string | null} */
  let reviewJustification = null;
  /** @type {string | null} */
  let profileApprovedBy = null;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === '--agent') {
      if (agent !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --agent exige identidade nao-flag.', {
          guard: 'usage',
          nextAction: 'Informe --agent <agent> uma unica vez.',
        });
      }
      agent = value;
      index += 1;
    } else if (flag === '--profile') {
      if (profile !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --profile exige FAST|STANDARD|FULL.', {
          guard: 'usage',
          nextAction: 'Informe --profile uma unica vez.',
        });
      }
      profile = value;
      index += 1;
    } else if (flag === '--justification') {
      if (justification !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --justification exige texto.', {
          guard: 'usage',
          nextAction: 'Informe --justification "<texto>" uma unica vez.',
        });
      }
      justification = value;
      index += 1;
    } else if (flag === '--reviews') {
      if (reviews !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --reviews exige 0, 1 ou 2.', {
          guard: 'usage',
          nextAction: 'Informe --reviews uma unica vez.',
        });
      }
      reviews = Number(value);
      index += 1;
    } else if (flag === '--review-justification') {
      if (reviewJustification !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --review-justification exige texto.', {
          guard: 'usage',
          nextAction: 'Informe --review-justification uma unica vez.',
        });
      }
      reviewJustification = value;
      index += 1;
    } else if (flag === '--profile-approved-by') {
      if (profileApprovedBy !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --profile-approved-by exige identidade humana.', {
          guard: 'usage',
          nextAction: 'Informe --profile-approved-by uma unica vez.',
        });
      }
      profileApprovedBy = value;
      index += 1;
    } else {
      throw new StateMachineError(`Uso: flag ou argumento desconhecido: ${flag}.`, {
        guard: 'usage',
        nextAction: 'Use apenas flags documentadas de task start.',
      });
    }
  }

  if (!agent || agent.trim() === '') {
    throw new StateMachineError('Agente obrigatorio e nao vazio.', {
      guard: 'usage',
      nextAction: 'Informe --agent com a identidade do writer.',
    });
  }
  if (!profile) {
    throw new StateMachineError('Perfil obrigatorio.', {
      guard: 'profile',
      nextAction: 'Informe --profile FAST|STANDARD|FULL.',
    });
  }
  if (!justification || justification.trim() === '') {
    throw new StateMachineError('Justificativa obrigatoria.', {
      guard: 'usage',
      nextAction: 'Informe --justification nao vazia.',
    });
  }
  if (reviews === null) reviews = profile === 'FAST' ? 0 : profile === 'STANDARD' ? 1 : 2;

  return {
    specId,
    taskId,
    agent: agent.trim(),
    profile,
    justification,
    reviews,
    reviewJustification,
    profileApprovedBy,
  };
}

/**
 * Exige blockers em SESSION_CLOSED (mais estrito que DONE/PUSHED do helper
 * compartilhado) e reutiliza isTaskBlockedByDependencies para a semantica base.
 * @param {{ id: string, blocked_by?: string[] }} task
 * @param {Array<{ id: string, status: string }>} tasks
 */
function assertBlockersSessionClosed(task, tasks) {
  if (isTaskBlockedByDependencies(task, tasks)) {
    const open = (task.blocked_by ?? []).filter((depId) => {
      const dep = tasks.find((item) => item.id === depId);
      return !dep || (dep.status !== 'DONE' && dep.status !== 'PUSHED' && dep.status !== 'SESSION_CLOSED');
    });
    throw new StateMachineError(
      `Tarefa bloqueada por dependencias abertas (${open.join(', ') || 'desconhecidas'}).`,
      {
        guard: 'blocked-by',
        nextAction: 'Feche a sessao dos blockers antes de iniciar a tarefa.',
      },
    );
  }
  const byId = new Map(tasks.map((item) => [item.id, item]));
  for (const depId of task.blocked_by ?? []) {
    const dep = byId.get(depId);
    if (!dep || dep.status !== 'SESSION_CLOSED') {
      throw new StateMachineError(
        `Blocker ${depId} nao esta SESSION_CLOSED (${dep?.status ?? 'ausente'}).`,
        {
          guard: 'blocked-by',
          nextAction: 'Feche a sessao dos blockers antes de iniciar a tarefa.',
        },
      );
    }
  }
}
