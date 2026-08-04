import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { StateMachineError } from './state-machine.mjs';

export const REVIEW_AXES = Object.freeze(['spec-compliance', 'engineering-quality']);
export const REVIEW_AXIS_SET = new Set(REVIEW_AXES);
export const REVIEW_SEVERITIES = Object.freeze(['BLOCKING', 'MAJOR', 'MINOR', 'NIT']);
export const REVIEW_STATUSES = Object.freeze(['OPEN', 'RESOLVED', 'NOT_APPLICABLE']);
export const REVIEW_RESULTS = Object.freeze(['PASS', 'BLOCK']);
export const REVIEW_REPORT_SCHEMA_VERSION = 2;

const REVIEW_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const GENERIC_EVIDENCE = /^(n\/?a|todo|tbd|none|sem evidencia|evidencia gen[eé]rica|\.+)$/i;

/**
 * @param {string} path
 */
export function parseStructuredReviewReport(path) {
  const raw = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
  const lines = raw.split('\n');
  /** @type {Map<string, string>} */
  const fields = new Map();

  if (lines[0] !== '---') {
    throw new StateMachineError(`Review ${basename(path)} sem frontmatter YAML.`, {
      guard: 'review-report',
      nextAction: 'Produza o relatorio com frontmatter schema_version 2 completo.',
    });
  }
  const end = lines.indexOf('---', 1);
  if (end < 0) {
    throw new StateMachineError(`Review ${basename(path)} com frontmatter incompleto.`, {
      guard: 'review-report',
      nextAction: 'Feche o frontmatter com --- e inclua o bloco JSON.',
    });
  }
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    fields.set(match[1], stripQuotes(match[2].trim()));
  }

  const body = lines.slice(end + 1).join('\n');
  const findingsPayload = extractFindingsJson(body, basename(path));

  const schemaVersion = Number(fields.get('schema_version'));
  const blockingRaw = fields.get('blocking_findings');
  const blockingFindings = blockingRaw == null ? NaN : Number(blockingRaw);

  return {
    path,
    file: basename(path),
    raw,
    schema_version: schemaVersion,
    task_id: fields.get('task_id') ?? null,
    axis: fields.get('axis') ?? null,
    reviewer: fields.get('reviewer') ?? null,
    review_run_id: fields.get('review_run_id') ?? null,
    package_id: fields.get('package_id') ?? null,
    fixed_point: fields.get('fixed_point') ?? null,
    result: fields.get('result') ?? null,
    blocking_findings: blockingFindings,
    reviewed_at: fields.get('reviewed_at') ?? null,
    summary: typeof findingsPayload.summary === 'string' ? findingsPayload.summary : '',
    findings: Array.isArray(findingsPayload.findings) ? findingsPayload.findings : null,
  };
}

/**
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 * @param {{
 *   taskId: string,
 *   axis: string,
 *   packageId: string,
 *   fixedPoint: string,
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} expected
 */
export function assertStructuredReviewReport(report, expected) {
  if (report.schema_version !== REVIEW_REPORT_SCHEMA_VERSION) {
    throw new StateMachineError(`Review ${report.file} com schema_version invalido.`, {
      guard: 'review-report',
      nextAction: `Use schema_version: ${REVIEW_REPORT_SCHEMA_VERSION}.`,
    });
  }
  if (report.task_id !== expected.taskId) {
    throw new StateMachineError(`Review ${report.file} com task_id divergente.`, {
      guard: 'review-report',
      nextAction: `Ajuste task_id para ${expected.taskId}.`,
    });
  }
  if (report.axis !== expected.axis || !REVIEW_AXIS_SET.has(report.axis ?? '')) {
    throw new StateMachineError(`Review ${report.file} com axis divergente.`, {
      guard: 'review-axis',
      nextAction: `Use axis ${expected.axis}.`,
    });
  }
  if (!report.package_id || report.package_id !== expected.packageId) {
    throw new StateMachineError(`Review ${report.file} com package_id divergente.`, {
      guard: 'review-package',
      nextAction: 'Copie o package_id do manifest do pacote preparado.',
    });
  }
  if (!report.fixed_point || report.fixed_point !== expected.fixedPoint) {
    throw new StateMachineError(`Review ${report.file} stale (fixed_point divergente).`, {
      guard: 'review-stale',
      nextAction: 'Regenere o pacote e o relatorio para o fixed point atual.',
    });
  }
  if (!report.reviewer || !String(report.reviewer).trim()) {
    throw new StateMachineError(`Review ${report.file} sem reviewer.`, {
      guard: 'review-report',
      nextAction: 'Informe reviewer no frontmatter.',
    });
  }
  if (!report.review_run_id || !String(report.review_run_id).trim()) {
    throw new StateMachineError(`Review ${report.file} sem review_run_id.`, {
      guard: 'review-report',
      nextAction: 'Informe review_run_id exclusivo da sessao do revisor.',
    });
  }
  assertReviewedAtChronology(report, expected);
  if (!Array.isArray(report.findings)) {
    throw new StateMachineError(`Review ${report.file} sem bloco JSON de findings.`, {
      guard: 'review-report',
      nextAction: 'Inclua um unico bloco ```json com summary e findings.',
    });
  }
  if (typeof report.summary !== 'string' || report.summary.trim() === '') {
    throw new StateMachineError(`Review ${report.file} sem summary.`, {
      guard: 'review-report',
      nextAction: 'Preencha summary no bloco JSON.',
    });
  }

  assertFindings(report);
  assertResultConsistency(report);
  assertNoCrossAxisContamination(report, expected.axis);
}

/**
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 */
function assertFindings(report) {
  const ids = new Set();
  let openBlocking = 0;

  for (const [index, finding] of report.findings.entries()) {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
      throw new StateMachineError(`Finding #${index + 1} invalido em ${report.file}.`, {
        guard: 'review-report',
        nextAction: 'Use objetos finding com id, severity, status, title, evidence e recommendation.',
      });
    }
    const id = finding.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new StateMachineError(`Finding sem id em ${report.file}.`, {
        guard: 'review-report',
        nextAction: 'Atribua ids unicos (ex.: F001).',
      });
    }
    if (ids.has(id)) {
      throw new StateMachineError(`Finding id duplicado ${id} em ${report.file}.`, {
        guard: 'review-report',
        nextAction: 'Use ids unicos dentro do mesmo relatorio.',
      });
    }
    ids.add(id);

    if (!REVIEW_SEVERITIES.includes(finding.severity)) {
      throw new StateMachineError(`Severity invalida em ${id}.`, {
        guard: 'review-report',
        nextAction: `Use severity ${REVIEW_SEVERITIES.join('|')}.`,
      });
    }
    if (!REVIEW_STATUSES.includes(finding.status)) {
      throw new StateMachineError(`Status invalido em ${id}.`, {
        guard: 'review-report',
        nextAction: `Use status ${REVIEW_STATUSES.join('|')}.`,
      });
    }
    for (const field of ['title', 'evidence', 'recommendation']) {
      if (typeof finding[field] !== 'string' || finding[field].trim() === '') {
        throw new StateMachineError(`Finding ${id} com ${field} vazio.`, {
          guard: 'review-report',
          nextAction: `Preencha ${field} com evidencia concreta.`,
        });
      }
    }
    if (GENERIC_EVIDENCE.test(finding.evidence.trim())) {
      throw new StateMachineError(`Finding ${id} com evidence generica.`, {
        guard: 'review-report',
        nextAction: 'Descreva evidencia concreta (arquivo, comportamento ou trecho).',
      });
    }
    assertFindingLocation(finding, id);

    if (finding.severity === 'BLOCKING' && finding.status === 'OPEN') {
      openBlocking += 1;
    }
  }

  if (!Number.isInteger(report.blocking_findings) || report.blocking_findings < 0) {
    throw new StateMachineError(`Review ${report.file} com blocking_findings invalido.`, {
      guard: 'review-report',
      nextAction: 'Use blocking_findings inteiro >= 0 igual ao numero de BLOCKING+OPEN.',
    });
  }
  if (report.blocking_findings !== openBlocking) {
    throw new StateMachineError(
      `blocking_findings=${report.blocking_findings} diverge de ${openBlocking} BLOCKING+OPEN.`,
      {
        guard: 'review-report',
        nextAction: 'Ajuste blocking_findings para a contagem real de blockers abertos.',
      },
    );
  }
}

/**
 * @param {Record<string, unknown>} finding
 * @param {string} id
 */
function assertFindingLocation(finding, id) {
  const location = finding.location;
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new StateMachineError(`Finding ${id} sem location.`, {
      guard: 'review-report',
      nextAction: 'Informe location.file/line ou not_applicable_reason.',
    });
  }
  const file = location.file;
  const line = location.line;
  const reason = location.not_applicable_reason;

  if (file == null && line == null) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new StateMachineError(`Finding ${id} sem not_applicable_reason.`, {
        guard: 'review-report',
        nextAction: 'Quando file/line forem null, preencha not_applicable_reason.',
      });
    }
    return;
  }

  if (typeof file !== 'string' || file.trim() === '' || file.startsWith('/') || file.includes('\\')
    || file.split('/').includes('..')) {
    throw new StateMachineError(`Finding ${id} com location.file invalido.`, {
      guard: 'review-report',
      nextAction: 'Use caminho relativo POSIX valido em location.file.',
    });
  }
  if (!Number.isInteger(line) || /** @type {number} */ (line) < 1) {
    throw new StateMachineError(`Finding ${id} com location.line invalido.`, {
      guard: 'review-report',
      nextAction: 'Use line inteiro positivo quando file for aplicavel.',
    });
  }
  if (reason != null) {
    throw new StateMachineError(`Finding ${id} com not_applicable_reason indevido.`, {
      guard: 'review-report',
      nextAction: 'Com file/line preenchidos, not_applicable_reason deve ser null.',
    });
  }
}

/**
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 */
function assertResultConsistency(report) {
  if (!REVIEW_RESULTS.includes(/** @type {string} */ (report.result))) {
    throw new StateMachineError(`Review ${report.file} com result invalido.`, {
      guard: 'review-report',
      nextAction: 'Use result PASS ou BLOCK.',
    });
  }
  if (report.blocking_findings > 0 && report.result !== 'BLOCK') {
    throw new StateMachineError(`Review ${report.file}: PASS com blocker aberto.`, {
      guard: 'review-blocking',
      nextAction: 'Defina result: BLOCK quando blocking_findings > 0.',
    });
  }
  if (report.blocking_findings === 0 && report.result !== 'PASS') {
    throw new StateMachineError(`Review ${report.file}: BLOCK sem blockers abertos.`, {
      guard: 'review-report',
      nextAction: 'Defina result: PASS quando blocking_findings = 0.',
    });
  }
}

/**
 * Normaliza texto para detecção best-effort de contaminação entre eixos.
 * @param {unknown} value
 */
export function normalizeReviewInspectionText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_/\-.,:;!?()[\]{}"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Coleta strings estruturadas do relatório para inspeção.
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 */
function collectInspectionStrings(report) {
  /** @type {string[]} */
  const parts = [String(report.raw ?? ''), String(report.summary ?? '')];
  for (const finding of report.findings ?? []) {
    if (!finding || typeof finding !== 'object') continue;
    for (const key of ['title', 'evidence', 'recommendation']) {
      if (typeof finding[key] === 'string') parts.push(finding[key]);
    }
    const location = finding.location;
    if (location && typeof location === 'object' && typeof location.not_applicable_reason === 'string') {
      parts.push(location.not_applicable_reason);
    }
  }
  return parts;
}

/**
 * Proteção determinística best-effort contra referências textuais ao outro eixo
 * ou ao resultado do aggregate. Não detecta paráfrases semânticas arbitrárias.
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 * @param {string} axis
 */
function assertNoCrossAxisContamination(report, axis) {
  const otherAxis = axis === 'spec-compliance' ? 'engineering-quality' : 'spec-compliance';
  let haystack = normalizeReviewInspectionText(collectInspectionStrings(report).join('\n'));
  // Permite mencoes legítimas a arquivos de codigo (ex.: review-aggregate.mjs).
  haystack = haystack
    .replace(/\bscripts agentctl domain review aggregate\.mjs\b/g, ' ')
    .replace(/\breview aggregate\.mjs\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /** @type {string[]} */
  const forbidden = [
    otherAxis,
    otherAxis.replace(/-/g, ' '),
    otherAxis.replace(/-/g, '_'),
    `${otherAxis} md`,
    `eixo ${otherAxis.replace(/-/g, ' ')}`,
    `axis ${otherAxis.replace(/-/g, ' ')}`,
    'resultado do outro eixo',
    `resultado do eixo ${otherAxis.replace(/-/g, ' ')}`,
    'conclusao do outro eixo',
    'relatorio do outro eixo',
    'aggregate result',
    'resultado do aggregate',
    'resultado da agregacao',
    'conclusao do aggregate',
    'conclusao da agregacao',
    'aggregate passou',
    'aggregate pass',
  ];

  for (const hint of forbidden) {
    const normalizedHint = normalizeReviewInspectionText(hint);
    if (normalizedHint && haystack.includes(normalizedHint)) {
      throw new StateMachineError(
        `Review ${report.file} contem resultado/contaminacao do outro eixo.`,
        {
          guard: 'review-report',
          nextAction:
            'Remova referencias ao outro eixo, resultado/conclusao do aggregate ou relatorio alheio. Isolamento semantico e best-effort.',
        },
      );
    }
  }
}

/**
 * Rejeita sequências de fence Markdown em strings antes da serialização canônica.
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 */
export function assertNoMarkdownFenceInjection(report) {
  const fence = '```';
  /** @param {string} label @param {unknown} value */
  const check = (label, value) => {
    if (typeof value === 'string' && value.includes(fence)) {
      throw new StateMachineError(
        `Review ${report.file} contem fence Markdown em ${label}.`,
        {
          guard: 'review-report',
          nextAction:
            'Remova sequencias de fence Markdown do summary/findings e registre novamente.',
        },
      );
    }
  };
  check('summary', report.summary);
  /** @param {unknown} value @param {string} path */
  const walk = (value, path) => {
    if (typeof value === 'string') {
      check(path, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(report.findings, 'findings');
}

/**
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 * @param {{
 *   evidenceRecordedAt: string,
 *   now?: Date | string | number,
 * }} expected
 */
function assertReviewedAtChronology(report, expected) {
  const reviewedMs = parseIsoTimestamp(report.reviewed_at);
  if (reviewedMs == null) {
    throw new StateMachineError(`Review ${report.file} com reviewed_at invalido.`, {
      guard: 'review-report',
      nextAction: 'Use timestamp ISO-8601 UTC real posterior a evidencia.',
    });
  }
  const evidenceMs = parseIsoTimestamp(expected.evidenceRecordedAt);
  if (evidenceMs == null) {
    throw new StateMachineError('evidence.recorded_at invalido para checagem cronologica.', {
      guard: 'review-report',
      nextAction: 'Regenere o review apos task validate.',
    });
  }
  if (reviewedMs < evidenceMs) {
    throw new StateMachineError(`Review ${report.file} anterior a evidencia de validacao.`, {
      guard: 'review-report',
      nextAction: 'Regere o review depois da validacao atual.',
    });
  }
  const nowMs = resolveNowMs(expected.now);
  if (reviewedMs > nowMs + REVIEW_CLOCK_SKEW_MS) {
    throw new StateMachineError(
      `Review ${report.file} com reviewed_at no futuro alem da tolerancia.`,
      {
        guard: 'review-report',
        nextAction: 'Use um timestamp real dentro da tolerancia de relogio.',
      },
    );
  }
}

/**
 * @param {string} body
 * @param {string} file
 */
function extractFindingsJson(body, file) {
  const fenced = /```json\s*([\s\S]*?)```/i.exec(body);
  if (!fenced) {
    throw new StateMachineError(`Review ${file} sem bloco JSON estrito.`, {
      guard: 'review-report',
      nextAction: 'Inclua um unico bloco ```json com summary e findings.',
    });
  }
  try {
    return JSON.parse(fenced[1]);
  } catch {
    throw new StateMachineError(`Review ${file} com JSON de findings invalido.`, {
      guard: 'review-report',
      nextAction: 'Corrija o JSON dentro do bloco fenced.',
    });
  }
}

/** @param {unknown} value */
function parseIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** @param {Date | string | number | undefined} value */
function resolveNowMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

/** @param {string} value */
function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Serializa relatorio canonico compativel com assertApplicableReviews.
 * @param {ReturnType<typeof parseStructuredReviewReport>} report
 */
export function formatCanonicalReviewMarkdown(report) {
  assertNoMarkdownFenceInjection(report);
  const findingsJson = JSON.stringify(
    {
      summary: report.summary,
      findings: report.findings,
    },
    null,
    2,
  );
  return [
    '---',
    `schema_version: ${REVIEW_REPORT_SCHEMA_VERSION}`,
    `task_id: "${report.task_id}"`,
    `axis: ${report.axis}`,
    `reviewer: ${report.reviewer}`,
    `review_run_id: "${report.review_run_id}"`,
    `package_id: "${report.package_id}"`,
    `fixed_point: "${report.fixed_point}"`,
    `result: ${report.result}`,
    `blocking_findings: ${report.blocking_findings}`,
    `reviewed_at: "${report.reviewed_at}"`,
    '---',
    '',
    '```json',
    findingsJson,
    '```',
    '',
  ].join('\n');
}
