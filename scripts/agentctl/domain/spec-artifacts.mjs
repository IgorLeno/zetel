import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const REQUIRED_LAYOUT_ARTIFACTS = Object.freeze(['SPEC.md', 'SPEC-SUMMARY.md', 'PLAN.md', 'TASKS.md']);
const HASHED_ROOT_ARTIFACTS = new Set(['SPEC.md', 'PLAN.md', 'TASKS.md']);
const OPERATIONAL_TASK_FIELDS = new Set([
  'status', 'commit', 'push', 'review_result', 'handoff', 'validation', 'validated_at', 'reviewed_at',
]);
const OPEN_MARKER = /^[ \t]*(?:OPEN_QUESTION:|TODO_APPROVAL:|\{\{[A-Z0-9_]+\}\})/m;

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
    if (HASHED_ROOT_ARTIFACTS.has(path) || path.startsWith('tasks/')) {
      manifest.push({ path: toPortablePath(path), sha256: sha256(canonicalizeArtifact(path, raw)) });
    }
  }
  manifest.sort((a, b) => comparePortablePaths(a.path, b.path));
  return { manifest, missing, openMarkers };
}

/** @param {{ path: string, sha256: string }[]} manifest */
export function aggregateDigest(manifest) {
  return sha256(`${JSON.stringify(manifest)}\n`);
}

/** @param {string} specDir @param {string} taskId */
export function readTaskFrontmatter(specDir, taskId) {
  const candidates = collectTaskFiles(specDir);
  for (const path of candidates) {
    const raw = readFileSync(join(specDir, path), 'utf8');
    const id = /^id:\s*["']?([^"'\n]+)["']?\s*$/m.exec(raw)?.[1]?.trim();
    if (id === taskId) return { path, raw };
  }
  return null;
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

/** @param {string} specDir @param {{ tasks: { id: string }[] }} state */
export function checkTaskCoherence(specDir, state) {
  const taskFiles = collectTaskFiles(specDir);
  /** @type {string[]} */
  const fileIds = [];
  const issues = [];
  for (const file of taskFiles) {
    const id = /^id:\s*["']?([^"'\n]+)["']?\s*$/m.exec(readFileSync(join(specDir, file), 'utf8'))?.[1]?.trim();
    if (id) fileIds.push(id);
    else issues.push(`arquivo individual sem id: ${file}`);
  }
  const taskList = existsSync(join(specDir, 'TASKS.md')) ? readFileSync(join(specDir, 'TASKS.md'), 'utf8') : '';
  const tableIds = taskList.split(/\r?\n/)
    .map((line) => /^\|\s*([^|]+?)\s*\|/.exec(line)?.[1]?.trim())
    .filter((id) => id && id !== 'ID' && !/^[-:]+$/.test(id));
  compareTaskIds('state.json', state.tasks.map((task) => task.id), issues);
  compareTaskIds('arquivos individuais', fileIds, issues);
  compareTaskIds('TASKS.md', tableIds, issues);
  const expected = state.tasks.map((task) => task.id);
  requireExactTaskIds('arquivos individuais', fileIds, expected, issues);
  requireExactTaskIds('TASKS.md', tableIds, expected, issues);
  return issues;
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
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} value */
function toPortablePath(value) {
  return value.split(sep).join('/');
}
