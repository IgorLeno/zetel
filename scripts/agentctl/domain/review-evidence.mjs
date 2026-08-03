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
  if (reviewPaths.length < expected.reviewsRequested) {
    throw new StateMachineError(
      `Reviews insuficientes: ${reviewPaths.length} de ${expected.reviewsRequested}.`,
      {
        guard: 'review-missing',
        nextAction: 'Adicione os relatorios versionados aplicaveis ao perfil antes de close.',
      },
    );
  }

  const parsed = reviewPaths.map((path) => parseReviewReport(path));
  const selected = parsed.slice(0, expected.reviewsRequested);
  const axes = new Set();

  for (const review of selected) {
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
    if (axes.has(review.axis)) {
      throw new StateMachineError('Dois reviews devem usar eixos distintos.', {
        guard: 'review-invalid',
        nextAction: 'Separe conformidade e qualidade em eixos diferentes.',
      });
    }
    axes.add(review.axis);
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
    if (review.result === 'BLOCK' || review.blocking_findings > 0) {
      throw new StateMachineError(
        `Review bloqueante em ${review.file} (result=${review.result}, findings=${review.blocking_findings}).`,
        {
          guard: 'review-blocking',
          nextAction: 'Corrija os findings, atualize evidencias e reviews, depois feche.',
        },
      );
    }
    if (review.result !== 'PASS' || review.blocking_findings !== 0) {
      throw new StateMachineError(`Review ${review.file} sem PASS limpo.`, {
        guard: 'review-invalid',
        nextAction: 'Registre result: PASS e blocking_findings: 0.',
      });
    }
  }

  return selected;
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
