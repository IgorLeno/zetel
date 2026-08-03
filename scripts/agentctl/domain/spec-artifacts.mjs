import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const REQUIRED_LAYOUT_ARTIFACTS = Object.freeze(['SPEC.md', 'SPEC-SUMMARY.md', 'PLAN.md', 'TASKS.md']);
const HASHED_ROOT_ARTIFACTS = new Set(['SPEC.md', 'PLAN.md', 'TASKS.md']);
const OPERATIONAL_TASK_FIELDS = new Set([
  'status', 'commit', 'push', 'review_result', 'handoff', 'validation', 'validated_at', 'reviewed_at',
]);
const OPEN_MARKER = /^[ \t]*(?:OPEN_QUESTION:|TODO_APPROVAL:|\{\{[A-Z0-9_]+\}\})/m;
const REQUIRED_TEMPLATE_SECTIONS = Object.freeze({
  mini: Object.freeze({
    'SPEC.md': Object.freeze(['Problema', 'Resultado esperado', 'Limites', 'Verificacao', 'Decisoes aprovaveis']),
    'PLAN.md': Object.freeze(['Arquitetura', 'Verificacao']),
  }),
  full: Object.freeze({
    'SPEC.md': Object.freeze([
      'Problema', 'Resultado esperado', 'Requisitos funcionais', 'Requisitos nao funcionais',
      'Arquitetura', 'Alternativas rejeitadas', 'Riscos', 'Estrategia de testes',
      'Rollout e rollback', 'Decisoes aprovaveis',
    ]),
    'PLAN.md': Object.freeze([
      'Arquitetura', 'Etapas de implementacao', 'Interfaces e dados',
      'Estrategia de testes', 'Rollout e rollback', 'Verificacao',
    ]),
  }),
});

/** @param {string} value */
export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** @param {string} value */
export function normalizeArtifactText(value) {
  return `${value.replace(/\r\n?/g, '\n').replace(/\n*$/, '')}\n`;
}

/** @param {string} relativePath @param {string} value */
export function canonicalizeArtifact(relativePath, value) {
  const normalized = normalizeArtifactText(value);
  if (!relativePath.startsWith('tasks/') || !relativePath.endsWith('.md')) return normalized;
  const lines = normalized.split('\n');
  if (lines[0] !== '---') return normalized;
  const end = lines.indexOf('---', 1);
  if (end < 0) return normalized;
  const frontmatter = lines.slice(1, end).filter((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    return !match || !OPERATIONAL_TASK_FIELDS.has(match[1]);
  });
  return [...lines.slice(0, 1), ...frontmatter, ...lines.slice(end)].join('\n');
}

/** @param {string} specDir */
export function collectApprovalArtifacts(specDir) {
  /** @type {string[]} */
  const missing = [];
  /** @type {{ path: string, sha256: string }[]} */
  const manifest = [];
  /** @type {string[]} */
  const openMarkers = [];
  /** @type {string[]} */
  const readinessIssues = [];
  const paths = [...REQUIRED_LAYOUT_ARTIFACTS];
  const tasksDir = join(specDir, 'tasks');

  for (const path of REQUIRED_LAYOUT_ARTIFACTS) {
    if (!existsSync(join(specDir, path))) missing.push(path);
  }
  if (!existsSync(tasksDir) || !statSync(tasksDir).isDirectory()) {
    missing.push('tasks/');
  } else {
    const taskFiles = readdirSync(tasksDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `tasks/${entry.name}`)
      .sort(comparePortablePaths);
    if (!taskFiles.length) missing.push('tasks/*.md');
    paths.push(...taskFiles);
  }

  for (const path of paths.sort(comparePortablePaths)) {
    const diskPath = join(specDir, path);
    if (!existsSync(diskPath) || !statSync(diskPath).isFile()) continue;
    const raw = readFileSync(diskPath, 'utf8');
    if (OPEN_MARKER.test(raw)) openMarkers.push(path);
    if (!hasSubstantiveMarkdown(raw)) readinessIssues.push(`${path} nao possui conteudo substantivo`);
    if (HASHED_ROOT_ARTIFACTS.has(path) || path.startsWith('tasks/')) {
      manifest.push({ path: toPortablePath(path), sha256: sha256(canonicalizeArtifact(path, raw)) });
    }
  }
  manifest.sort((a, b) => comparePortablePaths(a.path, b.path));
  return { manifest, missing, openMarkers, readinessIssues };
}

/** @param {{ path: string, sha256: string }[]} manifest */
export function aggregateDigest(manifest) {
  return sha256(`${JSON.stringify(manifest)}\n`);
}

/** @param {string} specDir */
export function collectTaskFiles(specDir) {
  const tasksDir = join(specDir, 'tasks');
  if (!existsSync(tasksDir) || !statSync(tasksDir).isDirectory()) return [];
  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `tasks/${entry.name}`)
    .sort(comparePortablePaths);
}

/**
 * Valida apenas as secoes canonicas criadas pelos templates novos. Reapproval
 * legada usa coerencia/substancia, sem exigir retroativamente estes headings.
 * @param {string} specDir
 * @param {'mini'|'full'} kind
 */
export function checkTemplateSections(specDir, kind) {
  const expected = REQUIRED_TEMPLATE_SECTIONS[kind];
  if (!expected) return [`kind sem contrato de secoes: ${String(kind)}`];
  const issues = [];
  for (const [path, headings] of Object.entries(expected)) {
    const diskPath = join(specDir, path);
    if (!existsSync(diskPath) || !statSync(diskPath).isFile()) continue;
    const raw = normalizeArtifactText(readFileSync(diskPath, 'utf8'));
    for (const heading of headings) {
      if (!raw.split('\n').some((line) => line.trim() === `## ${heading}`)) {
        issues.push(`${path} nao possui secao obrigatoria: ${heading}`);
      }
    }
  }
  return issues;
}

/** @param {string} specDir @param {{ tasks: { id: string, title?: string, status?: string, blocked_by: string[] }[] }} state */
export function checkTaskCoherence(specDir, state) {
  const taskFiles = collectTaskFiles(specDir);
  /** @type {string[]} */
  const fileIds = [];
  /** @type {Map<string, { path: string, id: string, title: string, blocked_by: string[] }>} */
  const filesById = new Map();
  const issues = [];
  for (const file of taskFiles) {
    const parsed = parseTaskFrontmatter(readFileSync(join(specDir, file), 'utf8'));
    if (parsed.issues.length) issues.push(...parsed.issues.map((issue) => `${file}: ${issue}`));
    if (!parsed.id) {
      issues.push(`arquivo individual sem id no frontmatter: ${file}`);
      continue;
    }
    fileIds.push(parsed.id);
    if (parsed.title && parsed.blocked_by) {
      filesById.set(parsed.id, { path: file, id: parsed.id, title: parsed.title, blocked_by: parsed.blocked_by });
    }
  }
  const taskList = existsSync(join(specDir, 'TASKS.md')) ? readFileSync(join(specDir, 'TASKS.md'), 'utf8') : '';
  const table = parseCanonicalTaskTable(taskList);
  issues.push(...table.issues);
  const tableIds = table.rows.map((row) => row.id);
  compareTaskIds('state.json', state.tasks.map((task) => task.id), issues);
  compareTaskIds('arquivos individuais', fileIds, issues);
  compareTaskIds('TASKS.md', tableIds, issues);
  const expected = state.tasks.map((task) => task.id);
  requireExactTaskIds('arquivos individuais', fileIds, expected, issues);
  requireExactTaskIds('TASKS.md', tableIds, expected, issues);
  const knownIds = new Set(expected);
  for (const task of state.tasks) {
    if (typeof task.title !== 'string' || !task.title.trim()) {
      issues.push(`state.json tarefa ${task.id} sem titulo`);
    }
    validateDependencies(`state.json tarefa ${task.id}`, task.id, task.blocked_by, knownIds, issues);
    const file = filesById.get(task.id);
    const row = table.rows.find((item) => item.id === task.id);
    if (file && typeof task.title === 'string' && file.title !== task.title) {
      issues.push(`titulo diverge para ${task.id}: state.json="${task.title}" tasks/="${file.title}"`);
    }
    if (row && typeof task.title === 'string' && row.title !== task.title) {
      issues.push(`titulo diverge para ${task.id}: state.json="${task.title}" TASKS.md="${row.title}"`);
    }
    if (file && !sameStringArray(file.blocked_by, task.blocked_by)) {
      issues.push(`blocked_by diverge para ${task.id}: state.json=${JSON.stringify(task.blocked_by)} tasks/=${JSON.stringify(file.blocked_by)}`);
    }
    if (row && !sameStringArray(row.blocked_by, task.blocked_by)) {
      issues.push(`blocked_by diverge para ${task.id}: state.json=${JSON.stringify(task.blocked_by)} TASKS.md=${JSON.stringify(row.blocked_by)}`);
    }
  }
  for (const file of filesById.values()) validateDependencies(file.path, file.id, file.blocked_by, knownIds, issues);
  for (const row of table.rows) validateDependencies(`TASKS.md tarefa ${row.id}`, row.id, row.blocked_by, knownIds, issues);
  return issues;
}

/** @param {string} raw */
function hasSubstantiveMarkdown(raw) {
  let lines = normalizeArtifactText(raw).split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end >= 0) lines = lines.slice(end + 1);
  }
  return lines.some((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && trimmed !== '---' && !/^#{1,6}(?:\s+|$)/.test(trimmed);
  });
}

/** @param {string} raw */
function parseTaskFrontmatter(raw) {
  const lines = normalizeArtifactText(raw).split('\n');
  const issues = [];
  if (lines[0] !== '---') return { id: null, title: null, blocked_by: null, issues: ['frontmatter ausente'] };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { id: null, title: null, blocked_by: null, issues: ['frontmatter nao fechado'] };
  const values = new Map();
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    if (values.has(match[1])) issues.push(`campo duplicado no frontmatter: ${match[1]}`);
    values.set(match[1], match[2].trim());
  }
  const id = parseScalar(values.get('id'));
  const title = parseScalar(values.get('title'));
  const blockedBy = parseStringArray(values.get('blocked_by'));
  if (!id) issues.push('id nao vazio obrigatorio no frontmatter');
  if (!title) issues.push('title nao vazio obrigatorio no frontmatter');
  if (!blockedBy.ok) issues.push('blocked_by deve ser array de strings no frontmatter');
  return { id, title, blocked_by: blockedBy.ok ? blockedBy.value : null, issues };
}

/** @param {string | undefined} value */
function parseScalar(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith('"') || trimmed.endsWith('"')) && !(trimmed.startsWith('"') && trimmed.endsWith('"'))) return null;
  if ((trimmed.startsWith("'") || trimmed.endsWith("'")) && !(trimmed.startsWith("'") && trimmed.endsWith("'"))) return null;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim() || null;
  }
  return trimmed;
}

/** @param {string | undefined} value */
function parseStringArray(value) {
  if (typeof value !== 'string') return { ok: false, value: [] };
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim())) return { ok: false, value: [] };
    if (new Set(parsed).size !== parsed.length) return { ok: false, value: [] };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, value: [] };
  }
}

/** @param {string} raw */
function parseCanonicalTaskTable(raw) {
  const lines = normalizeArtifactText(raw).split('\n');
  const headers = [];
  for (let index = 0; index < lines.length; index += 1) {
    const cells = parseTableCells(lines[index]);
    if (cells && cells.length === 4 && cells[0] === 'ID' && cells[1] === 'Titulo' && cells[2] === 'Bloqueada por' && cells[3] === 'Status') headers.push(index);
  }
  if (!headers.length) return { rows: [], issues: ['TASKS.md sem tabela canonica | ID | Titulo | Bloqueada por | Status |'] };
  const issues = [];
  if (headers.length > 1) issues.push('TASKS.md possui tabela canonica duplicada');
  const header = headers[0];
  const separator = parseTableCells(lines[header + 1] ?? '');
  if (!separator || separator.length !== 4 || separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    issues.push('TASKS.md possui separador invalido na tabela canonica');
    return { rows: [], issues };
  }
  const rows = [];
  for (let index = header + 2; index < lines.length; index += 1) {
    const cells = parseTableCells(lines[index]);
    if (!cells) break;
    if (cells.length !== 4) {
      issues.push(`TASKS.md possui linha invalida na tabela: ${lines[index].trim()}`);
      continue;
    }
    const [id, title, blockedCell, status] = cells;
    const blocked_by = /^(?:|—|-)$/.test(blockedCell) ? [] : blockedCell.split(',').map((item) => item.trim()).filter(Boolean);
    if (!id || !title || !status) issues.push(`TASKS.md possui tarefa com campo vazio: ${id || '(sem id)'}`);
    if (new Set(blocked_by).size !== blocked_by.length) issues.push(`TASKS.md tarefa ${id} possui blocked_by duplicado`);
    rows.push({ id, title, blocked_by, status });
  }
  return { rows, issues };
}

/** @param {string} line */
function parseTableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

/** @param {string} source @param {string} id @param {string[]} dependencies @param {Set<string>} knownIds @param {string[]} issues */
function validateDependencies(source, id, dependencies, knownIds, issues) {
  if (!Array.isArray(dependencies)) return;
  if (dependencies.includes(id)) issues.push(`${source} possui autodependencia: ${id}`);
  for (const dependency of dependencies) if (!knownIds.has(dependency)) issues.push(`${source} possui dependencia inexistente: ${dependency}`);
}

/** @param {string[]} left @param {string[]} right */
function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index]);
}

/** @param {string} source @param {string[]} ids @param {string[]} issues */
function compareTaskIds(source, ids, issues) {
  for (const id of new Set(ids)) if (ids.filter((item) => item === id).length > 1) issues.push(`${source} possui id duplicado: ${id}`);
}

/** @param {string} source @param {string[]} actual @param {string[]} expected @param {string[]} issues */
function requireExactTaskIds(source, actual, expected, issues) {
  for (const id of expected) if (!actual.includes(id)) issues.push(`${source} nao lista a tarefa ${id}`);
  for (const id of actual) if (!expected.includes(id)) issues.push(`${source} lista tarefa sem state.json: ${id}`);
}

/** @param {string} left @param {string} right */
export function comparePortablePaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

/** @param {string} value */
function toPortablePath(value) {
  return value.split(sep).join('/');
}
