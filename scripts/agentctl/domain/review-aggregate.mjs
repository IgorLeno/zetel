import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { listReviewFiles, toPosixRelative } from './evidence.mjs';
import {
  assertStructuredReviewReport,
  parseStructuredReviewReport,
  REVIEW_AXES,
} from './review-report.mjs';
import { sha256File } from './review-package.mjs';
import { StateMachineError, validateState } from './state-machine.mjs';

export const AGGREGATE_SCHEMA_VERSION = 1;

/**
 * @param {string} specDir
 * @param {string} taskId
 */
export function aggregatePath(specDir, taskId) {
  return join(specDir, 'reviews', `${taskId}-aggregate.json`);
}

/**
 * @param {{
 *   root: string,
 *   specDir: string,
 *   specId: string,
 *   taskId: string,
 *   fixedPoint: string,
 *   reviewsRequested: number,
 *   writer: string,
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} input
 */
export function buildReviewAggregate(input) {
  if (!Number.isInteger(input.reviewsRequested) || input.reviewsRequested < 0) {
    throw new StateMachineError('reviews_requested invalido no aggregate.', {
      guard: 'review-aggregate',
      nextAction: 'Corrija reviews_requested antes de agregar.',
    });
  }

  const reviewPaths = listReviewFiles(input.specDir, input.taskId);
  if (reviewPaths.length < input.reviewsRequested) {
    throw new StateMachineError(
      `Reviews insuficientes para aggregate: ${reviewPaths.length} de ${input.reviewsRequested}.`,
      {
        guard: 'review-aggregate',
        nextAction: 'Registre os relatorios canonicos faltantes com task review record.',
      },
    );
  }

  /** @type {Array<ReturnType<typeof parseStructuredReviewReport> & { hash: string }>} */
  const reports = [];
  for (const path of reviewPaths) {
    const parsed = parseStructuredReviewReport(path);
    assertStructuredReviewReport(parsed, {
      taskId: input.taskId,
      axis: String(parsed.axis),
      packageId: String(parsed.package_id),
      fixedPoint: input.fixedPoint,
      evidenceRecordedAt: input.evidenceRecordedAt,
      now: input.now,
    });
    if (parsed.fixed_point !== input.fixedPoint) {
      throw new StateMachineError(`Review ${parsed.file} com fixed_point divergente no aggregate.`, {
        guard: 'review-stale',
        nextAction: 'Regenere pacotes e reviews para o fixed point atual.',
      });
    }
    reports.push({ ...parsed, hash: sha256File(path) });
  }

  // Relatorios extras bloqueantes tambem falham o aggregate (inclusive com reviews_requested 0).
  for (const report of reports) {
    if (report.result === 'BLOCK' || report.blocking_findings > 0) {
      throw new StateMachineError(
        `Review bloqueante em ${report.file} impede aggregate PASS.`,
        {
          guard: 'review-blocking',
          nextAction: 'Corrija os findings, revalide e refaca as revisoes independentes.',
        },
      );
    }
  }

  // reviews_requested e minimo; o aggregate inclui todos os relatorios validos do disco.
  assertMinimumAxesCovered(reports, input.reviewsRequested);
  if (reports.length > 0) {
    assertIndependence(reports, input.writer);
  }

  /** @type {Record<string, number>} */
  const bySeverity = { BLOCKING: 0, MAJOR: 0, MINOR: 0, NIT: 0 };
  /** @type {Record<string, number>} */
  const byStatus = { OPEN: 0, RESOLVED: 0, NOT_APPLICABLE: 0 };
  let blockingOpen = 0;
  /** @type {unknown[]} */
  const allFindings = [];

  for (const report of reports) {
    for (const finding of report.findings ?? []) {
      allFindings.push({
        axis: report.axis,
        ...finding,
      });
      if (finding.severity in bySeverity) bySeverity[finding.severity] += 1;
      if (finding.status in byStatus) byStatus[finding.status] += 1;
      if (finding.severity === 'BLOCKING' && finding.status === 'OPEN') {
        blockingOpen += 1;
      }
    }
  }

  if (blockingOpen > 0) {
    throw new StateMachineError(
      `Aggregate bloqueado: ${blockingOpen} finding(s) BLOCKING+OPEN.`,
      {
        guard: 'review-blocking',
        nextAction: 'Corrija os findings bloqueantes e refaca validate/review.',
      },
    );
  }

  const generatedAt = new Date().toISOString();
  const aggregate = {
    schema_version: AGGREGATE_SCHEMA_VERSION,
    spec_id: input.specId,
    task_id: input.taskId,
    fixed_point: input.fixedPoint,
    generated_at: generatedAt,
    reviews_requested: input.reviewsRequested,
    axes: reports.map((item) => item.axis),
    report_paths: reports.map((item) => toPosixRelative(item.path, input.root)),
    report_hashes: Object.fromEntries(
      reports.map((item) => [toPosixRelative(item.path, input.root), item.hash]),
    ),
    reviewers: reports.map((item) => item.reviewer),
    review_run_ids: reports.map((item) => item.review_run_id),
    package_ids: reports.map((item) => item.package_id),
    findings_by_severity: bySeverity,
    findings_by_status: byStatus,
    findings: allFindings,
    blocking_findings: blockingOpen,
    result: 'PASS',
  };

  return aggregate;
}

/**
 * @param {string} specDir
 * @param {string} taskId
 * @param {Record<string, unknown>} aggregate
 */
export function writeReviewAggregate(specDir, taskId, aggregate) {
  const path = aggregatePath(specDir, taskId);
  writeTextAtomic(path, `${JSON.stringify(aggregate, null, 2)}\n`);
  return path;
}

/**
 * Publica aggregate e atualiza state.json de forma coerente.
 * Se a escrita do estado falhar, restaura o aggregate anterior (ou remove o novo).
 * @param {{
 *   root: string,
 *   specDir: string,
 *   statePath: string,
 *   state: Record<string, unknown>,
 *   aggregate: Record<string, unknown>,
 *   taskId: string,
 * }} input
 */
export function publishReviewAggregateAndState(input) {
  const targetPath = aggregatePath(input.specDir, input.taskId);
  const aggregateRel = toPosixRelative(targetPath, input.root);
  const next = {
    ...input.state,
    session: {
      .../** @type {Record<string, unknown>} */ (input.state.session ?? {}),
      review_aggregate: aggregateRel,
      review_result: Object.fromEntries(
        (Array.isArray(input.aggregate.axes) ? input.aggregate.axes : []).map((axis) => [
          axis,
          'PASS',
        ]),
      ),
      aggregated_at: input.aggregate.generated_at,
      reviews_requested: input.aggregate.reviews_requested,
    },
  };

  const nextValidation = validateState(next);
  if (!nextValidation.ok) {
    throw new StateMachineError(nextValidation.errors.join(' '), {
      guard: 'state-invalid',
      nextAction: 'Corrija o estado antes de persistir o aggregate.',
    });
  }

  /** @type {string | null} */
  let previous = null;
  if (existsSync(targetPath)) {
    previous = readFileSync(targetPath, 'utf8');
  }

  try {
    writeTextAtomic(targetPath, `${JSON.stringify(input.aggregate, null, 2)}\n`);
    const written = writeJsonAtomic(input.statePath, next, {
      expectedRevision: /** @type {number} */ (input.state.revision),
    });
    return { path: targetPath, written, aggregateRel };
  } catch (error) {
    try {
      if (previous == null) {
        if (existsSync(targetPath)) unlinkSync(targetPath);
      } else {
        const restoreTmp = `${targetPath}.restore.${process.pid}.tmp`;
        writeFileSync(restoreTmp, previous, 'utf8');
        renameSync(restoreTmp, targetPath);
      }
    } catch {
      // best-effort restore; erro original prevalece
    }
    throw error;
  }
}

/**
 * Exigido por task close quando reviews_requested > 0.
 * Trata o aggregate como manifest estrito e relê os relatórios schema v2.
 * @param {{
 *   root: string,
 *   specDir: string,
 *   specId: string,
 *   taskId: string,
 *   fixedPoint: string,
 *   reviewsRequested: number,
 *   writer?: string,
 *   session?: Record<string, unknown> | null,
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} input
 */
export function assertAggregateForClose(input) {
  if (input.reviewsRequested <= 0) return null;

  const path = aggregatePath(input.specDir, input.taskId);
  if (!existsSync(path)) {
    throw new StateMachineError(`Aggregate ausente para ${input.taskId}.`, {
      guard: 'review-aggregate',
      nextAction: 'Execute task review aggregate apos registrar os eixos aplicaveis.',
    });
  }

  let aggregate;
  try {
    aggregate = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new StateMachineError('Aggregate corrompido.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate com task review aggregate.',
    });
  }

  if (aggregate.schema_version !== AGGREGATE_SCHEMA_VERSION) {
    throw new StateMachineError('Aggregate com schema invalido.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate com a versao atual.',
    });
  }
  if (aggregate.spec_id !== input.specId) {
    throw new StateMachineError('Aggregate aponta spec_id incorreto.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate da spec ativa.',
    });
  }
  if (aggregate.task_id !== input.taskId) {
    throw new StateMachineError('Aggregate aponta task_id incorreto.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate da tarefa ativa.',
    });
  }
  if (aggregate.fixed_point !== input.fixedPoint) {
    throw new StateMachineError('Aggregate stale (fixed_point divergente).', {
      guard: 'review-stale',
      nextAction: 'Revalide, refaca reviews e agregue novamente.',
    });
  }
  if (aggregate.result !== 'PASS' || Number(aggregate.blocking_findings) > 0) {
    throw new StateMachineError('Aggregate nao esta PASS.', {
      guard: 'review-blocking',
      nextAction: 'Corrija findings bloqueantes antes de task close.',
    });
  }
  if (Number(aggregate.reviews_requested) !== input.reviewsRequested) {
    throw new StateMachineError('Aggregate com reviews_requested divergente.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate com o reviews_requested atual da sessao.',
    });
  }

  const expectedAggregateRel = toPosixRelative(path, input.root);
  const session = input.session ?? {};
  if (session.review_aggregate !== expectedAggregateRel) {
    throw new StateMachineError(
      'session.review_aggregate ausente ou diverge do aggregate no disco.',
      {
        guard: 'review-aggregate',
        nextAction: 'Execute task review aggregate ate persistir o estado da sessao.',
      },
    );
  }
  if (session.aggregated_at !== aggregate.generated_at) {
    throw new StateMachineError(
      'session.aggregated_at diverge de aggregate.generated_at.',
      {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate; nao reutilize arquivo orfao.',
      },
    );
  }

  const axes = requireStringArray(aggregate.axes, 'axes');
  const reportPaths = requireStringArray(aggregate.report_paths, 'report_paths');
  const reviewers = requireStringArray(aggregate.reviewers, 'reviewers');
  const reviewRunIds = requireStringArray(aggregate.review_run_ids, 'review_run_ids');
  const packageIds = requireStringArray(aggregate.package_ids, 'package_ids');
  const hashes = aggregate.report_hashes;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
    throw new StateMachineError('Aggregate sem report_hashes.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate.',
    });
  }
  const hashKeys = Object.keys(hashes);
  if (hashKeys.length === 0) {
    throw new StateMachineError('Aggregate com report_hashes vazio.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate com hashes dos relatorios.',
    });
  }
  if (reportPaths.length !== hashKeys.length) {
    throw new StateMachineError('report_paths e report_hashes com tamanhos divergentes.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate sem edicao manual.',
    });
  }
  for (const rel of reportPaths) {
    if (!(rel in hashes)) {
      throw new StateMachineError(`report_path sem hash: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate.',
      });
    }
  }
  for (const rel of hashKeys) {
    if (!reportPaths.includes(rel)) {
      throw new StateMachineError(`report_hash sem path correspondente: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate.',
      });
    }
  }

  if (reportPaths.length < input.reviewsRequested) {
    throw new StateMachineError(
      `Aggregate com reports insuficientes: ${reportPaths.length} de ${input.reviewsRequested}.`,
      {
        guard: 'review-aggregate',
        nextAction: 'Registre e agregue a quantidade minima de reviews.',
      },
    );
  }
  if (
    axes.length !== reportPaths.length
    || reviewers.length !== reportPaths.length
    || reviewRunIds.length !== reportPaths.length
    || packageIds.length !== reportPaths.length
  ) {
    throw new StateMachineError('Listas do aggregate com tamanhos incoerentes.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate; axes/paths/reviewers/run_ids/package_ids devem alinhar.',
    });
  }

  if (input.reviewsRequested >= 2) {
    for (const required of REVIEW_AXES) {
      if (!axes.includes(required)) {
        throw new StateMachineError(`Aggregate sem eixo obrigatorio ${required}.`, {
          guard: 'review-aggregate',
          nextAction: 'Registre reviews dos dois eixos e agregue novamente.',
        });
      }
    }
  }
  if (new Set(axes).size !== axes.length) {
    throw new StateMachineError('Aggregate com eixos duplicados.', {
      guard: 'review-aggregate',
      nextAction: 'Use um relatorio por eixo.',
    });
  }
  if (new Set(reviewRunIds).size !== reviewRunIds.length) {
    throw new StateMachineError('Aggregate com review_run_ids duplicados.', {
      guard: 'review-aggregate',
      nextAction: 'Use sessoes de revisao independentes.',
    });
  }
  if (new Set(packageIds).size !== packageIds.length) {
    throw new StateMachineError('Aggregate com package_ids duplicados.', {
      guard: 'review-aggregate',
      nextAction: 'Prepare pacotes distintos por eixo.',
    });
  }

  const sessionReviewResult = session.review_result;
  if (!sessionReviewResult || typeof sessionReviewResult !== 'object') {
    throw new StateMachineError('session.review_result ausente apos aggregate.', {
      guard: 'review-aggregate',
      nextAction: 'Execute task review aggregate ate registrar review_result na sessao.',
    });
  }
  for (const axis of axes) {
    if (/** @type {Record<string, unknown>} */ (sessionReviewResult)[axis] !== 'PASS') {
      throw new StateMachineError(`session.review_result incoerente para ${axis}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate e confirme review_result PASS por eixo.',
      });
    }
  }

  const diskReviews = listReviewFiles(input.specDir, input.taskId)
    .map((item) => toPosixRelative(item, input.root))
    .sort();
  const expectedSorted = [...reportPaths].sort();
  if (diskReviews.length !== expectedSorted.length
    || diskReviews.some((item, index) => item !== expectedSorted[index])) {
    throw new StateMachineError(
      'Conjunto de reviews no disco diverge do aggregate.',
      {
        guard: 'review-aggregate',
        nextAction: 'Nao adicione/remova reviews apos o aggregate; regenere se necessario.',
      },
    );
  }

  /** @type {Array<ReturnType<typeof parseStructuredReviewReport>>} */
  const parsedReports = [];
  for (let index = 0; index < reportPaths.length; index += 1) {
    const rel = reportPaths[index];
    assertSafeRepoRelative(rel, input.root);
    const abs = resolve(input.root, rel);
    if (!existsSync(abs)) {
      throw new StateMachineError(`Relatorio do aggregate ausente: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Restaure os relatorios canonicos antes de close.',
      });
    }
    const actualHash = sha256File(abs);
    if (actualHash !== hashes[rel]) {
      throw new StateMachineError(`Hash do relatorio diverge do aggregate: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Nao edite reviews apos o aggregate; regenere se necessario.',
      });
    }
    const parsed = parseStructuredReviewReport(abs);
    assertStructuredReviewReport(parsed, {
      taskId: input.taskId,
      axis: String(parsed.axis),
      packageId: String(parsed.package_id),
      fixedPoint: input.fixedPoint,
      evidenceRecordedAt: input.evidenceRecordedAt,
      now: input.now,
    });
    if (parsed.axis !== axes[index]) {
      throw new StateMachineError(`Eixo do relatorio diverge do aggregate em ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate sem reordenar/editar relatorios.',
      });
    }
    if (parsed.reviewer !== reviewers[index]) {
      throw new StateMachineError(`Reviewer diverge do aggregate em ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate apos registrar os reviews.',
      });
    }
    if (parsed.review_run_id !== reviewRunIds[index]) {
      throw new StateMachineError(`review_run_id diverge do aggregate em ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate apos registrar os reviews.',
      });
    }
    if (parsed.package_id !== packageIds[index]) {
      throw new StateMachineError(`package_id diverge do aggregate em ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Regenere o aggregate apos registrar os reviews.',
      });
    }
    if (parsed.result !== 'PASS' || parsed.blocking_findings > 0) {
      throw new StateMachineError(`Review ${rel} nao esta PASS limpo.`, {
        guard: 'review-blocking',
        nextAction: 'Corrija findings e refaca aggregate.',
      });
    }
    parsedReports.push(parsed);
  }

  if (typeof input.writer === 'string' && input.writer.trim()) {
    const writerNorm = normalizeIdentity(input.writer);
    for (const reviewer of reviewers) {
      if (normalizeIdentity(reviewer) === writerNorm) {
        throw new StateMachineError(
          'Aggregate registra self-review do writer/agent da sessao.',
          {
            guard: 'review-aggregate',
            nextAction: 'Use revisor independente e regenere o aggregate.',
          },
        );
      }
    }
  }

  return aggregate;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function requireStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item)) {
    throw new StateMachineError(`Aggregate com ${field} invalido ou vazio.`, {
      guard: 'review-aggregate',
      nextAction: `Regenere o aggregate com ${field} completo.`,
    });
  }
  return /** @type {string[]} */ (value);
}

/**
 * @param {string} rel
 * @param {string} root
 */
function assertSafeRepoRelative(rel, root) {
  if (
    typeof rel !== 'string'
    || !rel
    || isAbsolute(rel)
    || rel.includes('\\')
    || rel.split('/').includes('..')
  ) {
    throw new StateMachineError(`Caminho de relatorio invalido no aggregate: ${String(rel)}.`, {
      guard: 'review-aggregate',
      nextAction: 'Use caminhos relativos POSIX dentro do repositorio.',
    });
  }
  const resolved = resolve(root, rel);
  const relToRoot = relative(root, resolved);
  if (!relToRoot || relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new StateMachineError(`Caminho de relatorio fora do repositorio: ${rel}.`, {
      guard: 'review-aggregate',
      nextAction: 'Mantenha reviews sob .agent/specs/<spec-id>/reviews/.',
    });
  }
  if (!relToRoot.split(sep).join('/').startsWith('.agent/specs/')) {
    throw new StateMachineError(`Relatorio fora de .agent/specs: ${rel}.`, {
      guard: 'review-aggregate',
      nextAction: 'Mantenha reviews versionados sob a pasta da SPEC.',
    });
  }
}

/**
 * Confirma eixos mínimos exigidos por reviews_requested sem truncar o aggregate.
 * @param {Array<ReturnType<typeof parseStructuredReviewReport> & { hash: string }>} reports
 * @param {number} reviewsRequested
 */
function assertMinimumAxesCovered(reports, reviewsRequested) {
  for (const report of reports) {
    assertFilenameMatchesAxis(report);
    if (!report.axis || !REVIEW_AXES.includes(/** @type {'spec-compliance'|'engineering-quality'} */ (report.axis))) {
      throw new StateMachineError(`Review ${report.file} com axis invalido no aggregate.`, {
        guard: 'review-aggregate',
        nextAction: 'Use axis spec-compliance ou engineering-quality.',
      });
    }
  }

  if (reviewsRequested <= 0) return;

  if (reviewsRequested >= 2) {
    for (const axis of REVIEW_AXES) {
      if (!reports.some((item) => item.axis === axis)) {
        throw new StateMachineError(`Eixo ausente no aggregate: ${axis}.`, {
          guard: 'review-aggregate',
          nextAction: `Registre o review ${axis} antes de agregar.`,
        });
      }
    }
    return;
  }

  // reviews_requested === 1: ao menos um eixo aplicavel.
  if (!reports.some((item) => REVIEW_AXES.includes(/** @type {'spec-compliance'|'engineering-quality'} */ (item.axis)))) {
    throw new StateMachineError('Nenhum review com eixo aplicavel para aggregate.', {
      guard: 'review-aggregate',
      nextAction: 'Registre ao menos um review com axis valido.',
    });
  }
}

/**
 * @param {{ file: string, axis: string | null }} report
 */
function assertFilenameMatchesAxis(report) {
  if (!report.axis || !REVIEW_AXES.includes(/** @type {'spec-compliance'|'engineering-quality'} */ (report.axis))) {
    return;
  }
  const expectedSuffix = `-${report.axis}.md`;
  if (!report.file.endsWith(expectedSuffix)) {
    throw new StateMachineError(
      `Arquivo ${report.file} diverge do axis ${report.axis}.`,
      {
        guard: 'review-aggregate',
        nextAction: `Renomeie para *${expectedSuffix} ou corrija o axis do frontmatter.`,
      },
    );
  }
}

/**
 * @param {Array<{ reviewer: string | null, review_run_id: string | null, package_id: string | null, fixed_point: string | null, axis: string | null }>} selected
 * @param {string} writer
 */
function assertIndependence(selected, writer) {
  const writerNorm = normalizeIdentity(writer);
  if (!writerNorm) {
    throw new StateMachineError('Writer/agent da sessao ausente para checagem de independencia.', {
      guard: 'review-aggregate',
      nextAction: 'Registre agent/writer da tarefa antes de agregar.',
    });
  }

  const runIds = new Set();
  const packageIds = new Set();
  const fixedPoints = new Set();
  const axes = new Set();
  let writerCount = 0;

  for (const report of selected) {
    const reviewer = normalizeIdentity(report.reviewer);
    if (!reviewer) {
      throw new StateMachineError('Review sem identidade de reviewer.', {
        guard: 'review-aggregate',
        nextAction: 'Informe reviewer em todos os relatorios.',
      });
    }
    if (reviewer === writerNorm) writerCount += 1;

    if (!report.review_run_id) {
      throw new StateMachineError('Review sem review_run_id.', {
        guard: 'review-aggregate',
        nextAction: 'Use review_run_id exclusivo por sessao de revisao.',
      });
    }
    if (runIds.has(report.review_run_id)) {
      throw new StateMachineError('review_run_id duplicado entre eixos.', {
        guard: 'review-aggregate',
        nextAction: 'Abra sessoes independentes com review_run_id distintos.',
      });
    }
    runIds.add(report.review_run_id);

    if (!report.package_id) {
      throw new StateMachineError('Review sem package_id.', {
        guard: 'review-aggregate',
        nextAction: 'Copie o package_id do pacote preparado.',
      });
    }
    if (packageIds.has(report.package_id)) {
      throw new StateMachineError('package_id duplicado entre eixos.', {
        guard: 'review-aggregate',
        nextAction: 'Prepare pacotes separados por eixo (package_id distintos).',
      });
    }
    packageIds.add(report.package_id);

    fixedPoints.add(report.fixed_point);
    axes.add(report.axis);
  }

  if (fixedPoints.size !== 1) {
    throw new StateMachineError('Reviews com fixed_point diferentes.', {
      guard: 'review-stale',
      nextAction: 'Use o mesmo fixed point em todos os eixos.',
    });
  }

  // Qualquer review obrigatorio deve ser independente do writer (STANDARD e FULL).
  if (writerCount > 0) {
    throw new StateMachineError(
      'Writer/agent da sessao nao pode autoaprovar o proprio review.',
      {
        guard: 'review-aggregate',
        nextAction: 'Use revisor independente distinto do writer/agent da sessao.',
      },
    );
  }

  if (selected.length >= 2 && axes.size < 2) {
    throw new StateMachineError('Dois reviews devem usar eixos distintos.', {
      guard: 'review-aggregate',
      nextAction: 'Separe spec-compliance e engineering-quality.',
    });
  }
}

/** @param {unknown} value */
function normalizeIdentity(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}
