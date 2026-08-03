import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assertReviewsAllowed, buildGatePlan, isExecutionProfile } from '../domain/execution-profile.mjs';
import {
  assertApplicableGatesPassed,
  assertEvidenceFresh,
  listReviewFiles,
  readValidationEvidence,
  toPosixRelative,
} from '../domain/evidence.mjs';
import { assertApplicableReviews } from '../domain/review-evidence.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { assertTransition, StateMachineError, validateState } from '../domain/state-machine.mjs';
import { prepareOperationalFrontmatter } from '../domain/task-frontmatter.mjs';
import { resolveTaskFile } from '../domain/task-selection.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { assertInitialCommit } from '../infra/git-baseline.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

/**
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runTaskClose(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { specId, taskId } = parseCloseArgs(args);
    const { root, path, state, validation } = loadSpecState(specId, { cwd: io.cwd });
    if (!validation.ok) {
      throw new StateMachineError(validation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija o estado antes de fechar a tarefa.',
      });
    }
    assertInitialCommit(root);

    if (state.active_task !== taskId) {
      throw new StateMachineError(
        `active_task=${String(state.active_task)} diverge de ${taskId}.`,
        {
          guard: 'active-task',
          nextAction: 'Feche apenas a tarefa ativa correspondente.',
        },
      );
    }
    if (state.session?.task_id !== taskId) {
      throw new StateMachineError('session.task_id diverge do task-id informado.', {
        guard: 'session-task',
        nextAction: 'Use o task_id da sessao em REVIEWING.',
      });
    }
    if (state.session?.status !== 'REVIEWING') {
      throw new StateMachineError(
        `task close exige sessao REVIEWING (atual: ${String(state.session?.status)}).`,
        {
          guard: 'session-status',
          nextAction: 'Execute task validate com sucesso antes de close.',
        },
      );
    }

    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new StateMachineError(`Tarefa inexistente: ${taskId}.`, {
        guard: 'task-missing',
        nextAction: 'Informe um task-id existente.',
      });
    }
    if (task.status !== 'REVIEWING') {
      throw new StateMachineError(
        `task close exige tarefa REVIEWING (atual: ${task.status}).`,
        {
          guard: 'task-status',
          nextAction: 'Conclua task validate antes de close.',
        },
      );
    }

    const profile = /** @type {'FAST'|'STANDARD'|'FULL'} */ (
      task.execution_profile ?? state.session.execution_profile
    );
    if (!isExecutionProfile(profile)) {
      throw new StateMachineError('execution_profile invalido no fechamento.', {
        guard: 'profile',
        nextAction: 'Registre um perfil valido antes de close.',
      });
    }

    const reviewsRequested = normalizeReviewsRequested(
      task.reviews_requested ?? state.session.reviews_requested,
      profile,
      task.review_justification ?? state.session.review_justification,
    );

    const taskFile = resolveTaskFile(dirname(path), taskId);
    if (!taskFile) {
      throw new StateMachineError(`Arquivo da tarefa ${taskId} nao encontrado.`, {
        guard: 'task-file',
        nextAction: 'Restaure o markdown da tarefa antes de close.',
      });
    }

    const { path: evidencePath, evidence } = readValidationEvidence(dirname(path), taskId);
    const plan = Array.isArray(state.session.gates_plan)
      ? state.session.gates_plan
      : rebuildPlanFromEvidence(evidence, profile);

    assertEvidenceFresh(evidence, {
      root,
      taskFile,
      profile,
      plan,
    });
    assertApplicableGatesPassed(evidence, plan);

    if (String(evidence.validation_result ?? state.session.validation_result) === 'FAIL') {
      throw new StateMachineError('Evidencia registra falha de validacao.', {
        guard: 'gate-failed',
        nextAction: 'Reexecute task validate ate obter PASS.',
      });
    }

    const reviewFiles = listReviewFiles(dirname(path), taskId);
    const reviews = assertApplicableReviews(reviewFiles, {
      taskId,
      fixedPoint: String(evidence.fixed_point),
      reviewsRequested,
      evidenceRecordedAt: String(evidence.recorded_at ?? ''),
      now: new Date(),
    });

    assertTransition('task', 'REVIEWING', 'DONE');
    assertTransition('session', 'REVIEWING', 'DONE');

    const reviewResult = reviewsRequested === 0 ? 'NOT_REQUIRED' : 'PASS';
    const frontmatterFields = {
      status: 'DONE',
      validation: 'PASS',
      review_result: reviewResult,
    };
    // Prepara o markdown antes da escrita atomica do estado para falhar cedo.
    const preparedFrontmatter = prepareOperationalFrontmatter(taskFile, frontmatterFields);

    const doneAt = new Date().toISOString();
    const next = {
      ...state,
      active_task: null,
      tasks: state.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              status: 'DONE',
              review_result: reviewResult,
              validation: 'PASS',
            }
          : item,
      ),
      session: {
        ...state.session,
        status: 'DONE',
        done_at: doneAt,
        active_task_cleared: true,
        validation: toPosixRelative(evidencePath, root),
        fixed_point: evidence.fixed_point,
        review_result: Object.fromEntries(
          reviews.map((review) => [review.axis, review.result]),
        ),
        external_checks: state.session.external_checks ?? 'pending-not-waited',
        reviews_requested: reviewsRequested,
      },
    };

    const nextValidation = validateState(next);
    if (!nextValidation.ok) {
      throw new StateMachineError(nextValidation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija a transicao REVIEWING -> DONE.',
      });
    }

    const written = writeJsonAtomic(path, next, { expectedRevision: state.revision });
    try {
      writeFileSync(taskFile, preparedFrontmatter, 'utf8');
    } catch (error) {
      throw new StateMachineError(
        `Estado DONE persistido em state.json, mas frontmatter falhou: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          guard: 'task-file',
          nextAction:
            'Reconcilie o markdown da tarefa com status DONE, validation PASS e review_result alinhado; nao desfacca a escrita atomica ja confirmada.',
        },
      );
    }

    stdout.write([
      `task_closed: ${taskId}`,
      `spec_id: ${specId}`,
      `status: DONE`,
      `active_task: null`,
      `fixed_point: ${evidence.fixed_point}`,
      `reviews: ${reviewsRequested}`,
      `external_checks: ${written.session.external_checks}`,
      `revision: ${written.revision}`,
      'next_action: Commit/push/handoff permanecem fora de task close (tarefa 005).',
      '',
    ].join('\n'));
    return 0;
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseCloseArgs(args) {
  const [specId, taskId, ...rest] = args;
  if (!specId || !taskId || specId.startsWith('--') || taskId.startsWith('--') || rest.length > 0) {
    throw new StateMachineError('Uso: ./agentctl task close <spec-id> <task-id>.', {
      guard: 'usage',
      nextAction: 'Informe exatamente spec-id e task-id.',
    });
  }
  assertSafeSpecId(specId);
  return { specId, taskId };
}

/**
 * @param {unknown} raw
 * @param {'FAST'|'STANDARD'|'FULL'} profile
 * @param {unknown} reviewJustification
 */
function normalizeReviewsRequested(raw, profile, reviewJustification) {
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
    throw new StateMachineError(
      `reviews_requested invalido: ${raw}.`,
      {
        guard: 'reviews',
        nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
      },
    );
  }
  const converted = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(converted) || !Number.isInteger(converted) || converted < 0) {
    throw new StateMachineError(
      `reviews_requested invalido: ${String(raw)}.`,
      {
        guard: 'reviews',
        nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
      },
    );
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

/**
 * @param {Record<string, unknown>} evidence
 * @param {'FAST'|'STANDARD'|'FULL'} profile
 */
function rebuildPlanFromEvidence(evidence, profile) {
  const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
  const focused = commands
    .filter((item) => item && (item.category === 'focused' || item.category === 'integration'))
    .map((item) => ({
      category: String(item.category),
      argv: /** @type {string[]} */ (item.argv ?? []),
    }));
  const requireTestCi = commands.some((item) => item && item.category === 'test-ci');
  const typescriptAffected = commands.some((item) => item && item.category === 'typecheck');
  return buildGatePlan({
    profile,
    focused: focused.filter((item) => item.category === 'focused'),
    relatedIntegrations: focused.filter((item) => item.category === 'integration'),
    requireTestCi,
    typescriptAffected,
  });
}
