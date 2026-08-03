import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { StateMachineError } from './state-machine.mjs';

const AXES = new Set(['spec-compliance', 'engineering-quality']);

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
 * }} expected
 */
export function assertApplicableReviews(reviewPaths, expected) {
  if (expected.reviewsRequested === 0) {
    return [];
  }
  if (!Number.isFinite(expected.reviewsRequested)
    || !Number.isInteger(expected.reviewsRequested)
    || expected.reviewsRequested < 0) {
    throw new StateMachineError('reviews_requested invalido no fechamento.', {
      guard: 'reviews',
      nextAction: 'Corrija reviews_requested para um inteiro nao negativo permitido pelo perfil.',
    });
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

  // Todos os arquivos encontrados sao parseados e verificados; extras bloqueantes
  // nunca passam despercebidos.
  const parsed = reviewPaths.map((path) => parseReviewReport(path));
  for (const review of parsed) {
    assertReviewMetadata(review, expected);
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
 * @param {{ taskId: string, fixedPoint: string }} expected
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
