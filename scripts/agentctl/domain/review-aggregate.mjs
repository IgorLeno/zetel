import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { listReviewFiles } from './evidence.mjs';
import {
  assertStructuredReviewReport,
  parseStructuredReviewReport,
  REVIEW_AXES,
} from './review-report.mjs';
import { sha256File } from './review-package.mjs';
import { StateMachineError } from './state-machine.mjs';

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
      forbiddenAxisHints: contaminationHints(String(parsed.axis)),
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

  const selected = selectRequiredAxes(reports, input.reviewsRequested);
  if (selected.length > 0) {
    assertIndependence(selected, input.writer);
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
    axes: selected.map((item) => item.axis),
    report_paths: selected.map((item) => toPosixRelative(item.path, input.root)),
    report_hashes: Object.fromEntries(
      selected.map((item) => [toPosixRelative(item.path, input.root), item.hash]),
    ),
    reviewers: selected.map((item) => item.reviewer),
    review_run_ids: selected.map((item) => item.review_run_id),
    package_ids: selected.map((item) => item.package_id),
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
 * Exigido por task close quando reviews_requested > 0.
 * @param {{
 *   root: string,
 *   specDir: string,
 *   taskId: string,
 *   fixedPoint: string,
 *   reviewsRequested: number,
 *   writer?: string,
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

  const hashes = aggregate.report_hashes;
  if (!hashes || typeof hashes !== 'object') {
    throw new StateMachineError('Aggregate sem report_hashes.', {
      guard: 'review-aggregate',
      nextAction: 'Regenere o aggregate.',
    });
  }

  for (const [rel, expectedHash] of Object.entries(hashes)) {
    const abs = join(input.root, rel);
    if (!existsSync(abs)) {
      throw new StateMachineError(`Relatorio do aggregate ausente: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Restaure os relatorios canonicos antes de close.',
      });
    }
    const actual = sha256File(abs);
    if (actual !== expectedHash) {
      throw new StateMachineError(`Hash do relatorio diverge do aggregate: ${rel}.`, {
        guard: 'review-aggregate',
        nextAction: 'Nao edite reviews apos o aggregate; regenere se necessario.',
      });
    }
  }

  if (input.reviewsRequested >= 2) {
    const axes = Array.isArray(aggregate.axes) ? aggregate.axes : [];
    for (const required of REVIEW_AXES) {
      if (!axes.includes(required)) {
        throw new StateMachineError(`Aggregate sem eixo obrigatorio ${required}.`, {
          guard: 'review-aggregate',
          nextAction: 'Registre reviews dos dois eixos e agregue novamente.',
        });
      }
    }
  }

  // Fecha lacuna do caminho legado: close tambem rejeita self-review.
  if (typeof input.writer === 'string' && input.writer.trim()) {
    const writerNorm = normalizeIdentity(input.writer);
    const reviewers = Array.isArray(aggregate.reviewers) ? aggregate.reviewers : [];
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
 * @param {Array<ReturnType<typeof parseStructuredReviewReport> & { hash: string }>} reports
 * @param {number} reviewsRequested
 */
function selectRequiredAxes(reports, reviewsRequested) {
  if (reviewsRequested === 0) return [];

  for (const report of reports) {
    assertFilenameMatchesAxis(report);
  }

  if (reviewsRequested >= 2) {
    /** @type {typeof reports} */
    const selected = [];
    for (const axis of REVIEW_AXES) {
      const match = reports.find((item) => item.axis === axis);
      if (!match) {
        throw new StateMachineError(`Eixo ausente no aggregate: ${axis}.`, {
          guard: 'review-aggregate',
          nextAction: `Registre o review ${axis} antes de agregar.`,
        });
      }
      selected.push(match);
    }
    return selected;
  }

  // reviews_requested === 1: primeiro eixo valido distinto.
  const first = reports.find((item) => REVIEW_AXES.includes(/** @type {'spec-compliance'|'engineering-quality'} */ (item.axis)));
  if (!first) {
    throw new StateMachineError('Nenhum review com eixo aplicavel para aggregate.', {
      guard: 'review-aggregate',
      nextAction: 'Registre ao menos um review com axis valido.',
    });
  }
  return [first];
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

/** @param {string} axis */
function contaminationHints(axis) {
  if (axis === 'spec-compliance') {
    return [
      'engineering-quality review result',
      'eixo engineering-quality concluiu',
      'aggregate result',
      '"axis": "engineering-quality"',
    ];
  }
  return [
    'spec-compliance review result',
    'eixo spec-compliance concluiu',
    'aggregate result',
    '"axis": "spec-compliance"',
  ];
}

/** @param {unknown} value */
function normalizeIdentity(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/** @param {string} path @param {string} root */
function toPosixRelative(path, root) {
  return relative(root, path).split('\\').join('/');
}
