import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { StateMachineError } from './state-machine.mjs';

const AXES = new Set(['spec-compliance', 'engineering-quality']);
const REVIEW_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * @param {string} path
 */
export function parseReviewReport(path) {
  const raw = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n');
  /** @type {Map<string, string>} */
  const fields = new Map();

  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
        if (!match) continue;
        fields.set(match[1], stripQuotes(match[2].trim()));
      }
    }
  } else {
    for (const line of lines.slice(0, 40)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (!match) continue;
      fields.set(match[1], stripQuotes(match[2].trim()));
    }
  }

  const taskId = fields.get('task_id') ?? null;
  const axis = fields.get('axis') ?? null;
  const reviewer = fields.get('reviewer') ?? null;
  const fixedPoint = fields.get('fixed_point') ?? null;
  const result = fields.get('result') ?? null;
  const blockingRaw = fields.get('blocking_findings');
  const reviewedAt = fields.get('reviewed_at') ?? null;
  const blockingFindings = blockingRaw == null ? NaN : Number(blockingRaw);

  return {
    path,
    file: basename(path),
    task_id: taskId,
    axis,
    reviewer,
    fixed_point: fixedPoint,
    result,
    blocking_findings: blockingFindings,
    reviewed_at: reviewedAt,
    body: raw,
  };
}

/**
 * @param {string[]} reviewPaths
 * @param {{
 *   taskId: string,
 *   fixedPoint: string,
 *   reviewsRequested: number,
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} expected
 */
export function assertApplicableReviews(reviewPaths, expected) {
  if (!Number.isFinite(expected.reviewsRequested)
    || !Number.isInteger(expected.reviewsRequested)
    || expected.reviewsRequested < 0) {
    throw new StateMachineError('reviews_requested invalido no fechamento.', {
      guard: 'reviews',
      nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
    });
  }

  // Zero significa "nenhum review obrigatorio"; arquivos existentes ainda contam.
  const parsed = reviewPaths.map((path) => parseReviewReport(path));
  for (const review of parsed) {
    assertReviewMetadata(review, expected);
  }

  if (expected.reviewsRequested === 0) {
    return parsed;
  }

  if (reviewPaths.length < expected.reviewsRequested) {
    throw new StateMachineError(
      `Reviews insuficientes: ${reviewPaths.length} de ${expected.reviewsRequested}.`,
      {
        guard: 'review-missing',
        nextAction: 'Adicione os relatorios versionados aplicaveis ao perfil antes de close.',
      },
    );
  }

  // Conjunto minimo exigido: primeiros N com eixos distintos e PASS limpo.
  const selected = [];
  const axes = new Set();
  for (const review of parsed) {
    if (selected.length >= expected.reviewsRequested) break;
    if (!review.axis || !AXES.has(review.axis)) continue;
    if (axes.has(review.axis)) continue;
    if (review.result !== 'PASS' || review.blocking_findings !== 0) continue;
    axes.add(review.axis);
    selected.push(review);
  }

  if (selected.length < expected.reviewsRequested) {
    throw new StateMachineError(
      `Reviews PASS insuficientes com eixos distintos: ${selected.length} de ${expected.reviewsRequested}.`,
      {
        guard: 'review-missing',
        nextAction: 'Adicione reviews PASS limpos com eixos distintos ate cobrir reviews_requested.',
      },
    );
  }

  if (expected.reviewsRequested >= 2 && new Set(selected.map((item) => item.axis)).size < 2) {
    throw new StateMachineError('Dois reviews devem usar eixos distintos.', {
      guard: 'review-invalid',
      nextAction: 'Separe conformidade e qualidade em eixos diferentes.',
    });
  }

  return selected;
}

/**
 * @param {ReturnType<typeof parseReviewReport>} review
 * @param {{
 *   taskId: string,
 *   fixedPoint: string,
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} expected
 */
function assertReviewMetadata(review, expected) {
  if (review.task_id !== expected.taskId) {
    throw new StateMachineError(`Review ${review.file} aponta task_id incorreto.`, {
      guard: 'review-invalid',
      nextAction: `Ajuste task_id para ${expected.taskId}.`,
    });
  }
  if (!review.axis || !AXES.has(review.axis)) {
    throw new StateMachineError(`Review ${review.file} com axis invalido.`, {
      guard: 'review-invalid',
      nextAction: 'Use axis spec-compliance ou engineering-quality.',
    });
  }
  if (!review.reviewer || !review.reviewed_at) {
    throw new StateMachineError(`Review ${review.file} incompleto.`, {
      guard: 'review-invalid',
      nextAction: 'Preencha reviewer e reviewed_at.',
    });
  }
  assertReviewedAtChronology(review, expected);
  if (review.fixed_point !== expected.fixedPoint) {
    throw new StateMachineError(`Review ${review.file} stale (fixed_point divergente).`, {
      guard: 'review-stale',
      nextAction: 'Atualize o review para o fixed point atual da validacao.',
    });
  }
  if (!Number.isFinite(review.blocking_findings) || !Number.isInteger(review.blocking_findings)
    || review.blocking_findings < 0) {
    throw new StateMachineError(`Review ${review.file} com blocking_findings invalido.`, {
      guard: 'review-invalid',
      nextAction: 'Use blocking_findings inteiro >= 0.',
    });
  }
  if (review.result === 'BLOCK' || review.blocking_findings > 0) {
    throw new StateMachineError(
      `Review bloqueante em ${review.file} (result=${review.result}, findings=${review.blocking_findings}).`,
      {
        guard: 'review-blocking',
        nextAction: 'Corrija os findings, atualize evidencias e reviews, depois feche.',
      },
    );
  }
  if (review.result !== 'PASS') {
    throw new StateMachineError(`Review ${review.file} sem PASS limpo.`, {
      guard: 'review-invalid',
      nextAction: 'Registre result: PASS e blocking_findings: 0.',
    });
  }
}

/**
 * @param {ReturnType<typeof parseReviewReport>} review
 * @param {{
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} expected
 */
function assertReviewedAtChronology(review, expected) {
  const reviewedMs = parseIsoTimestamp(review.reviewed_at);
  if (reviewedMs == null) {
    throw new StateMachineError(`Review ${review.file} com reviewed_at invalido.`, {
      guard: 'review-invalid',
      nextAction: 'Regere o review depois da validacao atual usando um timestamp real.',
    });
  }

  const evidenceMs = parseIsoTimestamp(expected.evidenceRecordedAt);
  if (evidenceMs == null) {
    throw new StateMachineError('evidence.recorded_at invalido para checagem cronologica.', {
      guard: 'review-invalid',
      nextAction: 'Regere o review depois da validacao atual usando um timestamp real.',
    });
  }
  if (reviewedMs < evidenceMs) {
    throw new StateMachineError(
      `Review ${review.file} anterior a evidencia de validacao.`,
      {
        guard: 'review-invalid',
        nextAction: 'Regere o review depois da validacao atual usando um timestamp real.',
      },
    );
  }

  const nowMs = resolveNowMs(expected.now);
  if (reviewedMs > nowMs + REVIEW_CLOCK_SKEW_MS) {
    throw new StateMachineError(
      `Review ${review.file} com reviewed_at no futuro alem da tolerancia.`,
      {
        guard: 'review-invalid',
        nextAction: 'Regere o review depois da validacao atual usando um timestamp real.',
      },
    );
  }
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {Date | string | number | undefined} value
 */
function resolveNowMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

/**
 * @param {string} value
 */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
