import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildReviewAggregate,
  publishReviewAggregateAndState,
} from '../domain/review-aggregate.mjs';
import {
  assertApplicableGatesPassed,
  assertEvidenceFresh,
  readValidationEvidence,
  toPosixRelative,
} from '../domain/evidence.mjs';
import { buildGatePlan, isExecutionProfile } from '../domain/execution-profile.mjs';
import { normalizeReviewsRequested } from '../domain/review-count.mjs';
import {
  assertReviewAxis,
  assertReviewPackageIntegrity,
  prepareReviewPackage,
  readReviewPackageManifest,
  reviewPackageDir,
  writeCanonicalReviewAtomic,
} from '../domain/review-package.mjs';
import {
  assertStructuredReviewReport,
  formatCanonicalReviewMarkdown,
  parseStructuredReviewReport,
} from '../domain/review-report.mjs';
import { assertApprovedIntegrity } from '../domain/spec-approval-guard.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { StateMachineError } from '../domain/state-machine.mjs';
import { resolveTaskFile } from '../domain/task-selection.mjs';
import { assertInitialCommit } from '../infra/git-baseline.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

/**
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runTaskReview(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseReviewArgs(args);
    assertSafeSpecId(parsed.specId);

    if (parsed.mode === 'prepare') {
      return runPrepare(parsed, { cwd: io.cwd, stdout });
    }
    if (parsed.mode === 'record') {
      return runRecord(parsed, { cwd: io.cwd, stdout });
    }
    return runAggregate(parsed, { cwd: io.cwd, stdout });
  } catch (error) {
    return writeError(stderr, error);
  }
}

/**
 * @param {ReturnType<typeof parseReviewArgs>} parsed
 * @param {{ cwd?: string, stdout: NodeJS.WritableStream }} io
 */
function runPrepare(parsed, io) {
  const ctx = loadReviewContext(parsed.specId, parsed.taskId, { cwd: io.cwd });
  // prepare/record nunca alteram state.json
  const prepared = prepareReviewPackage({
    root: ctx.root,
    specId: parsed.specId,
    taskId: parsed.taskId,
    axis: /** @type {string} */ (parsed.axis),
    fixedPoint: ctx.fixedPoint,
    gitHead: String(ctx.evidence.git_head),
    evidencePath: ctx.evidencePath,
    evidence: ctx.evidence,
    taskFile: ctx.taskFile,
    state: ctx.state,
  });

  io.stdout.write([
    `review_prepared: ${parsed.taskId}`,
    `axis: ${parsed.axis}`,
    `fixed_point: ${ctx.fixedPoint}`,
    `package_id: ${prepared.manifest.package_id}`,
    `package_dir: ${toPosixRelative(prepared.packageDir, ctx.root)}`,
    `changed_files: ${prepared.material.files.length}`,
    `next_action: Execute o revisor externo com o review-prompt.md do pacote e registre com task review record.`,
    '',
  ].join('\n'));
  return 0;
}

/**
 * @param {ReturnType<typeof parseReviewArgs>} parsed
 * @param {{ cwd?: string, stdout: NodeJS.WritableStream }} io
 */
function runRecord(parsed, io) {
  const ctx = loadReviewContext(parsed.specId, parsed.taskId, { cwd: io.cwd });
  const axis = /** @type {string} */ (parsed.axis);
  const packageDir = reviewPackageDir(
    ctx.root,
    parsed.specId,
    parsed.taskId,
    ctx.fixedPoint,
    axis,
  );
  const manifest = readReviewPackageManifest(packageDir);
  assertReviewPackageIntegrity(packageDir, manifest, {
    taskId: parsed.taskId,
    axis,
    fixedPoint: ctx.fixedPoint,
    specId: parsed.specId,
    gitHead: String(ctx.evidence.git_head),
  });

  const reportFile = /** @type {string} */ (parsed.reportFile);
  const absolute = isAbsolute(reportFile) || win32.isAbsolute(reportFile);
  const absReport = absolute ? reportFile : resolve(ctx.root, reportFile);
  if (!existsSync(absReport)) {
    throw new StateMachineError(`Arquivo de relatorio ausente: ${reportFile}.`, {
      guard: 'review-report',
      nextAction: 'Informe --report-file com o Markdown produzido pelo revisor.',
    });
  }

  const parsedReport = parseStructuredReviewReport(absReport);
  assertStructuredReviewReport(parsedReport, {
    taskId: parsed.taskId,
    axis,
    packageId: String(manifest.package_id),
    fixedPoint: ctx.fixedPoint,
    evidenceRecordedAt: String(ctx.evidence.recorded_at ?? ''),
    now: new Date(),
  });

  const canonical = formatCanonicalReviewMarkdown(parsedReport);
  const target = join(ctx.specDir, 'reviews', `${parsed.taskId}-${axis}.md`);
  writeCanonicalReviewAtomic(target, canonical);

  io.stdout.write([
    `review_recorded: ${parsed.taskId}`,
    `axis: ${axis}`,
    `result: ${parsedReport.result}`,
    `blocking_findings: ${parsedReport.blocking_findings}`,
    `package_id: ${parsedReport.package_id}`,
    `report: ${toPosixRelative(target, ctx.root)}`,
    'next_action: Registre o outro eixo (se aplicavel) e execute task review aggregate.',
    '',
  ].join('\n'));
  return 0;
}

/**
 * @param {ReturnType<typeof parseReviewArgs>} parsed
 * @param {{ cwd?: string, stdout: NodeJS.WritableStream }} io
 */
function runAggregate(parsed, io) {
  const ctx = loadReviewContext(parsed.specId, parsed.taskId, { cwd: io.cwd });
  const writer = resolveWriter(ctx.state, ctx.task, ctx.taskFile);
  const aggregate = buildReviewAggregate({
    root: ctx.root,
    specDir: ctx.specDir,
    specId: parsed.specId,
    taskId: parsed.taskId,
    fixedPoint: ctx.fixedPoint,
    reviewsRequested: ctx.reviewsRequested,
    writer,
    evidenceRecordedAt: String(ctx.evidence.recorded_at ?? ''),
    now: new Date(),
  });

  // Aggregate + state sao publicados de forma coerente (rollback do arquivo se state falhar).
  const { written, aggregateRel } = publishReviewAggregateAndState({
    root: ctx.root,
    specDir: ctx.specDir,
    statePath: ctx.statePath,
    state: ctx.state,
    aggregate,
    taskId: parsed.taskId,
  });

  io.stdout.write([
    `review_aggregated: ${parsed.taskId}`,
    `result: ${aggregate.result}`,
    `fixed_point: ${aggregate.fixed_point}`,
    `axes: ${(aggregate.axes ?? []).join(',')}`,
    `aggregate: ${aggregateRel}`,
    `blocking_findings: ${aggregate.blocking_findings}`,
    `revision: ${written.revision}`,
    'next_action: Com aggregate PASS, execute task close.',
    '',
  ].join('\n'));
  return 0;
}

/**
 * Guardas comuns a prepare/record/aggregate.
 * @param {string} specId
 * @param {string} taskId
 * @param {{ cwd?: string }} options
 */
function loadReviewContext(specId, taskId, options = {}) {
  const { root, path: statePath, state, validation } = loadSpecState(specId, options);
  if (!validation.ok) {
    throw new StateMachineError(validation.errors.join(' '), {
      guard: 'state-invalid',
      nextAction: 'Corrija o estado antes de task review.',
    });
  }
  assertApprovedIntegrity(statePath, state);
  assertInitialCommit(root);

  if (state.active_task !== taskId) {
    throw new StateMachineError(
      `task review so opera na tarefa ativa (${String(state.active_task)}), nao em ${taskId}.`,
      {
        guard: 'active-task',
        nextAction: 'Informe o task-id da tarefa ativa em REVIEWING.',
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
      `task review exige sessao REVIEWING (atual: ${String(state.session?.status)}).`,
      {
        guard: 'review-state',
        nextAction: 'Execute task validate com sucesso antes de review.',
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
      `task review exige tarefa REVIEWING (atual: ${task.status}).`,
      {
        guard: 'review-state',
        nextAction: 'Conclua task validate antes de review.',
      },
    );
  }

  const profile = /** @type {'FAST'|'STANDARD'|'FULL'} */ (
    task.execution_profile ?? state.session.execution_profile
  );
  if (!isExecutionProfile(profile)) {
    throw new StateMachineError('execution_profile invalido no review.', {
      guard: 'profile',
      nextAction: 'Registre um perfil valido antes de review.',
    });
  }

  const reviewsRequested = normalizeReviewsRequested({
    raw: task.reviews_requested ?? state.session.reviews_requested,
    profile,
    reviewJustification: task.review_justification ?? state.session.review_justification,
  });

  const specDir = dirname(statePath);
  const taskFile = resolveTaskFile(specDir, taskId);
  if (!taskFile) {
    throw new StateMachineError(`Arquivo da tarefa ${taskId} nao encontrado.`, {
      guard: 'task-file',
      nextAction: 'Restaure o markdown da tarefa antes de review.',
    });
  }

  const { path: evidencePath, evidence } = readValidationEvidence(specDir, taskId);
  if (String(evidence.validation_result ?? state.session.validation_result) === 'FAIL') {
    throw new StateMachineError('Evidencia registra falha de validacao.', {
      guard: 'gate-failed',
      nextAction: 'Reexecute task validate ate obter PASS.',
    });
  }

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

  const fixedPoint = String(evidence.fixed_point ?? state.session.fixed_point ?? '');
  if (!fixedPoint) {
    throw new StateMachineError('fixed_point ausente na evidencia/sessao.', {
      guard: 'review-stale',
      nextAction: 'Reexecute task validate para capturar fixed point.',
    });
  }

  return {
    root,
    statePath,
    state,
    specDir,
    task,
    taskFile,
    evidencePath,
    evidence,
    profile,
    reviewsRequested,
    fixedPoint,
  };
}

/** @param {string[]} args */
function parseReviewArgs(args) {
  const [specId, taskId, mode, ...rest] = args;
  if (!specId || !taskId || !mode || specId.startsWith('--') || taskId.startsWith('--')) {
    throw new StateMachineError(
      'Uso: ./agentctl task review <spec-id> <task-id> <prepare|record|aggregate> [opcoes].',
      {
        guard: 'usage',
        nextAction: 'Informe spec-id, task-id e o modo prepare|record|aggregate.',
      },
    );
  }
  if (mode !== 'prepare' && mode !== 'record' && mode !== 'aggregate') {
    throw new StateMachineError(`Modo invalido: ${mode}.`, {
      guard: 'usage',
      nextAction: 'Use prepare, record ou aggregate.',
    });
  }

  /** @type {string | null} */
  let axis = null;
  /** @type {string | null} */
  let reportFile = null;
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--axis') {
      axis = rest[++i] ?? null;
      continue;
    }
    if (token === '--report-file') {
      reportFile = rest[++i] ?? null;
      continue;
    }
    throw new StateMachineError(`Opcao desconhecida: ${token}.`, {
      guard: 'usage',
      nextAction: 'Use apenas --axis e --report-file conforme o modo.',
    });
  }

  if (mode === 'prepare' || mode === 'record') {
    if (!axis) {
      throw new StateMachineError('Uso: --axis <spec-compliance|engineering-quality>.', {
        guard: 'usage',
        nextAction: 'Informe --axis no prepare/record.',
      });
    }
    assertReviewAxis(axis);
  }
  if (mode === 'record') {
    if (!reportFile) {
      throw new StateMachineError('Uso: --report-file <path>.', {
        guard: 'usage',
        nextAction: 'Informe --report-file com o Markdown do revisor.',
      });
    }
  }
  if (mode === 'aggregate' && (axis || reportFile)) {
    throw new StateMachineError('aggregate nao aceita --axis/--report-file.', {
      guard: 'usage',
      nextAction: 'Execute apenas: task review <spec> <task> aggregate.',
    });
  }

  return { specId, taskId, mode, axis, reportFile };
}

/**
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>} task
 * @param {string} taskFile
 */
function resolveWriter(state, task, taskFile) {
  const fromTask = typeof task.writer === 'string' ? task.writer.trim() : '';
  if (fromTask) return fromTask;
  const fromFrontmatter = readFrontmatterField(taskFile, 'writer');
  if (fromFrontmatter) return fromFrontmatter;
  const session = /** @type {Record<string, unknown>} */ (state.session ?? {});
  const fromSession = typeof session.agent === 'string' ? session.agent.trim() : '';
  if (fromSession) return fromSession;
  return '';
}

/**
 * @param {string} taskFile
 * @param {string} field
 */
function readFrontmatterField(taskFile, field) {
  try {
    const raw = readFileSync(taskFile, 'utf8').replace(/\r\n?/g, '\n');
    const lines = raw.split('\n');
    if (lines[0] !== '---') return '';
    const end = lines.indexOf('---', 1);
    if (end < 0) return '';
    for (const line of lines.slice(1, end)) {
      const match = new RegExp(`^${field}:\\s*(.*)$`).exec(line);
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value === 'null' || value === '~') return '';
      return value.trim();
    }
  } catch {
    return '';
  }
  return '';
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
