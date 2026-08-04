import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { isWorkflowOperationalPath } from './evidence.mjs';
import { sha256 } from './spec-artifacts.mjs';
import { REVIEW_AXIS_SET } from './review-report.mjs';
import { StateMachineError } from './state-machine.mjs';

export const PACKAGE_SCHEMA_VERSION = 1;
/** Alinhado ao limiar de untracked em evidence.mjs (1 MiB). */
const MAX_COPY_BYTES = 1_000_000;

const EXCLUDED_PREFIXES = Object.freeze([
  'node_modules/',
  '.next/',
  'coverage/',
  '.agent/runtime/',
  '.git/',
]);

/**
 * @param {string} axis
 */
export function assertReviewAxis(axis) {
  if (!REVIEW_AXIS_SET.has(axis)) {
    throw new StateMachineError(`Axis invalido: ${String(axis)}.`, {
      guard: 'review-axis',
      nextAction: 'Use --axis spec-compliance ou engineering-quality.',
    });
  }
}

/**
 * @param {string} root
 * @param {string} specId
 * @param {string} taskId
 * @param {string} fixedPoint
 * @param {string} axis
 */
export function reviewPackageDir(root, specId, taskId, fixedPoint, axis) {
  return join(root, '.agent', 'runtime', 'reviews', specId, taskId, fixedPoint, axis);
}

/**
 * @param {{
 *   root: string,
 *   specId: string,
 *   taskId: string,
 *   axis: string,
 *   fixedPoint: string,
 *   gitHead: string,
 *   evidencePath: string,
 *   evidence: Record<string, unknown>,
 *   taskFile: string,
 *   state: Record<string, unknown>,
 * }} input
 */
export function prepareReviewPackage(input) {
  assertReviewAxis(input.axis);
  const packageId = `pkg_${randomBytes(12).toString('hex')}`;
  const generatedAt = new Date().toISOString();
  const packageDir = reviewPackageDir(
    input.root,
    input.specId,
    input.taskId,
    input.fixedPoint,
    input.axis,
  );
  const stagingDir = `${packageDir}.staging.${process.pid}.${randomBytes(4).toString('hex')}`;

  try {
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });

    const material = captureMaterialDiff(input.root, String(input.gitHead));
    const docsDir = join(stagingDir, 'docs');
    mkdirSync(docsDir, { recursive: true });

    /** @type {Array<{ path: string, sha256: string }>} */
    const included = [];

    const writeIncluded = (relativePath, content) => {
      const abs = join(stagingDir, relativePath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
      included.push({ path: relativePath, sha256: sha256(content) });
    };

    writeIncluded('diff.patch', material.diffPatch);
    writeIncluded(
      'changed-files.json',
      `${JSON.stringify({
        base_commit: material.baseCommit,
        git_head: material.gitHead,
        files: material.files,
      }, null, 2)}\n`,
    );

    const evidenceCopy = `${JSON.stringify(input.evidence, null, 2)}\n`;
    writeIncluded('validation-evidence.json', evidenceCopy);

    if (input.axis === 'spec-compliance') {
      copyAuthorizedDoc(input.root, 'SPEC.md', docsDir, included, input.specId);
      copyAuthorizedDoc(input.root, 'PLAN.md', docsDir, included, input.specId);
      copyTaskDoc(input.taskFile, docsDir, included);
      writeIncluded(
        'docs/acceptance-criteria.md',
        buildAcceptanceCriteria(input.taskFile),
      );
      writeIncluded(
        'docs/approval-integrity-summary.json',
        `${JSON.stringify(buildApprovalSummary(input.state), null, 2)}\n`,
      );
    } else {
      copyRepoDoc(input.root, '.agent/ARCHITECTURE.md', docsDir, included);
      copyRepoDoc(input.root, '.agent/QUALITY.md', docsDir, included);
      copyRepoDoc(input.root, '.agent/EXECUTION_PROFILES.md', docsDir, included);
      if (existsSync(join(input.root, '.agent/COMMANDS.md'))) {
        copyRepoDoc(input.root, '.agent/COMMANDS.md', docsDir, included);
      }
      copyRelevantChangedFiles(input.root, material.files, join(stagingDir, 'changed'), included);
    }

    writeIncluded(
      'review-prompt.md',
      buildReviewPrompt({
        axis: input.axis,
        specId: input.specId,
        taskId: input.taskId,
        fixedPoint: input.fixedPoint,
        packageId,
      }),
    );

    const fingerprint = computePackageFingerprint({
      axis: input.axis,
      fixedPoint: input.fixedPoint,
      gitHead: material.gitHead,
      baseCommit: material.baseCommit,
      included,
    });

    const manifest = {
      schema_version: PACKAGE_SCHEMA_VERSION,
      package_id: packageId,
      spec_id: input.specId,
      task_id: input.taskId,
      axis: input.axis,
      fixed_point: input.fixedPoint,
      git_head: material.gitHead,
      base_commit: material.baseCommit,
      generated_at: generatedAt,
      validation_evidence_path: toPosix(relative(input.root, input.evidencePath)),
      included_files: included.map((item) => item.path).sort(),
      artifact_sha256: Object.fromEntries(
        included
          .slice()
          .sort((a, b) => a.path.localeCompare(b.path))
          .map((item) => [item.path, item.sha256]),
      ),
      package_fingerprint: fingerprint,
    };

    writeFileSync(
      join(stagingDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    rmSync(packageDir, { recursive: true, force: true });
    mkdirSync(dirname(packageDir), { recursive: true });
    renameSync(stagingDir, packageDir);

    return {
      packageDir,
      manifest,
      material,
    };
  } catch (error) {
    try {
      rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    if (error instanceof StateMachineError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new StateMachineError(`Falha ao preparar pacote de review: ${detail}`, {
      guard: 'review-package',
      nextAction: 'Corrija o ambiente e reexecute task review prepare.',
    });
  }
}

/**
 * @param {string} packageDir
 */
export function readReviewPackageManifest(packageDir) {
  const manifestPath = join(packageDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new StateMachineError(`Pacote de review ausente em ${packageDir}.`, {
      guard: 'review-package',
      nextAction: 'Execute task review prepare para o eixo antes de record.',
    });
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new StateMachineError('manifest.json do pacote corrompido.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote com task review prepare.',
    });
  }
}

/**
 * @param {string} packageDir
 * @param {Record<string, unknown>} manifest
 * @param {{
 *   taskId: string,
 *   axis: string,
 *   fixedPoint: string,
 *   specId?: string,
 *   gitHead?: string,
 * }} expected
 */
export function assertReviewPackageIntegrity(packageDir, manifest, expected) {
  if (manifest.schema_version !== PACKAGE_SCHEMA_VERSION) {
    throw new StateMachineError('Pacote com schema_version invalido.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote com a versao atual do agentctl.',
    });
  }
  if (expected.specId && manifest.spec_id !== expected.specId) {
    throw new StateMachineError('Pacote com spec_id divergente.', {
      guard: 'review-package',
      nextAction: 'Prepare o pacote para a spec ativa.',
    });
  }
  if (manifest.task_id !== expected.taskId) {
    throw new StateMachineError('Pacote com task_id divergente.', {
      guard: 'review-package',
      nextAction: 'Prepare o pacote para a tarefa ativa.',
    });
  }
  if (manifest.axis !== expected.axis) {
    throw new StateMachineError('Pacote com axis divergente.', {
      guard: 'review-axis',
      nextAction: 'Use o pacote do mesmo eixo informado em --axis.',
    });
  }
  if (manifest.fixed_point !== expected.fixedPoint) {
    throw new StateMachineError('Pacote stale (fixed_point divergente).', {
      guard: 'review-stale',
      nextAction: 'Reexecute task validate e prepare novos pacotes.',
    });
  }
  if (expected.gitHead) {
    if (manifest.git_head !== expected.gitHead || manifest.base_commit !== expected.gitHead) {
      throw new StateMachineError('Pacote com git_head/base_commit divergente da evidencia.', {
        guard: 'review-stale',
        nextAction: 'Regenere o pacote no HEAD da evidencia atual.',
      });
    }
  }
  if (typeof manifest.package_id !== 'string' || !manifest.package_id) {
    throw new StateMachineError('Pacote sem package_id.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote.',
    });
  }

  const artifactHashes = manifest.artifact_sha256;
  if (!artifactHashes || typeof artifactHashes !== 'object' || Array.isArray(artifactHashes)) {
    throw new StateMachineError('manifest sem artifact_sha256.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote.',
    });
  }
  const includedFiles = Array.isArray(manifest.included_files) ? manifest.included_files : null;
  if (!includedFiles || includedFiles.length === 0) {
    throw new StateMachineError('manifest sem included_files.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote.',
    });
  }
  const hashKeys = Object.keys(artifactHashes).sort();
  const includedSorted = [...includedFiles].map(String).sort();
  if (
    hashKeys.length !== includedSorted.length
    || hashKeys.some((key, index) => key !== includedSorted[index])
  ) {
    throw new StateMachineError('included_files diverge de artifact_sha256.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote; listas devem coincidir exatamente.',
    });
  }

  /** @type {Array<{ path: string, sha256: string }>} */
  const included = [];
  for (const [rel, expectedHash] of Object.entries(artifactHashes)) {
    const abs = assertSafePackageRelative(rel, packageDir);
    if (!existsSync(abs)) {
      throw new StateMachineError(`Artefato ausente no pacote: ${rel}.`, {
        guard: 'review-package',
        nextAction: 'Regenere o pacote; nao edite arquivos manuais.',
      });
    }
    const actual = sha256(readFileSync(abs, 'utf8'));
    if (actual !== expectedHash) {
      throw new StateMachineError(`SHA do artefato divergente: ${rel}.`, {
        guard: 'review-package',
        nextAction: 'Regenere o pacote; hashes devem corresponder aos arquivos.',
      });
    }
    included.push({ path: rel, sha256: actual });
  }

  const expectedFingerprint = computePackageFingerprint({
    axis: String(manifest.axis),
    fixedPoint: String(manifest.fixed_point),
    gitHead: String(manifest.git_head),
    baseCommit: String(manifest.base_commit),
    included,
  });
  if (manifest.package_fingerprint !== expectedFingerprint) {
    throw new StateMachineError('package_fingerprint divergente.', {
      guard: 'review-package',
      nextAction: 'Regenere o pacote; fingerprint deve cobrir os artefatos.',
    });
  }

  // Isolamento: pacote nao pode conter relatorio canonico/aggregate versionado.
  for (const rel of Object.keys(artifactHashes)) {
    const base = rel.split('/').pop()?.toLowerCase() ?? '';
    if (
      base.endsWith('-aggregate.json')
      || /^.+-(spec-compliance|engineering-quality)\.md$/.test(base)
    ) {
      throw new StateMachineError('Pacote contaminado com relatorio/aggregate.', {
        guard: 'review-package',
        nextAction: 'Regenere o pacote sem relatorios de review.',
      });
    }
  }
}

/**
 * @param {string} rel
 * @param {string} packageDir
 */
function assertSafePackageRelative(rel, packageDir) {
  if (
    typeof rel !== 'string'
    || !rel
    || isAbsolute(rel)
    || rel.includes('\\')
    || rel.split('/').includes('..')
  ) {
    throw new StateMachineError(`Caminho de artefato invalido no pacote: ${String(rel)}.`, {
      guard: 'review-package',
      nextAction: 'Regenere o pacote; use apenas caminhos relativos POSIX sem ..',
    });
  }
  const resolved = resolve(packageDir, rel);
  const relToPackage = relative(packageDir, resolved);
  if (!relToPackage || relToPackage.startsWith('..') || isAbsolute(relToPackage)) {
    throw new StateMachineError(`Artefato fora do pacote: ${rel}.`, {
      guard: 'review-package',
      nextAction: 'Regenere o pacote; caminhos devem permanecer dentro da pasta do eixo.',
    });
  }
  return resolved;
}

/**
 * @param {string} root
 * @param {string} gitHead
 */
export function captureMaterialDiff(root, gitHead) {
  const head = runGit(root, ['rev-parse', 'HEAD']).trim();
  if (head !== gitHead) {
    throw new StateMachineError('HEAD diverge do git_head da evidencia.', {
      guard: 'review-stale',
      nextAction: 'Reexecute task validate no HEAD atual.',
    });
  }

  const trackedNameStatus = parseNameStatus(
    runGitDiffExcluding(root, ['diff', '--name-status', 'HEAD']),
  );
  const stagedNameStatus = parseNameStatus(
    runGitDiffExcluding(root, ['diff', '--cached', '--name-status']),
  );
  const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .filter((file) => !shouldExcludeFromReviewDiff(file))
    .sort();

  /** @type {Map<string, { path: string, status: string, content_sha256: string | null }>} */
  const files = new Map();
  for (const item of [...trackedNameStatus, ...stagedNameStatus]) {
    files.set(item.path, {
      path: item.path,
      status: item.status,
      content_sha256: hashIfFile(root, item.path),
    });
  }
  for (const file of untracked) {
    files.set(file, {
      path: file,
      status: 'U',
      content_sha256: hashIfFile(root, file),
    });
  }

  const trackedDiff = runGitDiffExcluding(root, ['diff', 'HEAD']);
  const stagedDiff = runGitDiffExcluding(root, ['diff', '--cached']);
  const untrackedDiff = buildUntrackedDiff(root, untracked);
  const diffPatch = [
    `# base_commit: ${gitHead}`,
    `# git_head: ${head}`,
    '',
    trackedDiff,
    stagedDiff ? `\n# staged\n${stagedDiff}` : '',
    untrackedDiff ? `\n# untracked\n${untrackedDiff}` : '',
  ].join('\n');

  return {
    baseCommit: gitHead,
    gitHead: head,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    diffPatch: `${diffPatch}\n`,
  };
}

/**
 * @param {string} relativePath
 */
function shouldExcludeFromReviewDiff(relativePath) {
  const path = relativePath.split('\\').join('/');
  if (isWorkflowOperationalPath(path)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))) {
    return true;
  }
  if (path.includes('/secrets/') || path.endsWith('.env') || path.includes('.env.')) return true;
  return false;
}

/**
 * @param {string} root
 * @param {string[]} args
 */
function runGitDiffExcluding(root, args) {
  return runGit(root, [
    ...args,
    '--',
    '.',
    ':(exclude).agent/specs/*/state.json',
    ':(exclude).agent/specs/*/tasks/**',
    ':(exclude).agent/specs/*/evidence/**',
    ':(exclude).agent/specs/*/reviews/**',
    ':(exclude).agent/specs/*/handoffs/**',
    ':(exclude).agent/runtime/**',
    ':(exclude)node_modules/**',
    ':(exclude).next/**',
    ':(exclude)coverage/**',
  ]);
}

/**
 * @param {string} text
 */
function parseNameStatus(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Z](?:\d{3})?)\t(.+?)(?:\t(.+))?$/.exec(line);
      if (!match) return null;
      const status = match[1];
      const path = (match[3] ?? match[2]).split('\\').join('/');
      if (shouldExcludeFromReviewDiff(path)) return null;
      return { status, path };
    })
    .filter(Boolean);
}

/**
 * @param {string} root
 * @param {string[]} untracked
 */
function buildUntrackedDiff(root, untracked) {
  /** @type {string[]} */
  const chunks = [];
  for (const file of untracked) {
    const abs = join(root, file);
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_COPY_BYTES) {
        chunks.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ omitted large/unreadable @@\n`);
        continue;
      }
      const raw = readFileSync(abs);
      if (isBinaryBuffer(raw)) {
        chunks.push(
          `diff --git a/${file} b/${file}\nnew file mode 100644\nBinary files /dev/null and b/${file} differ\n`,
        );
        continue;
      }
      const content = raw.toString('utf8');
      const lines = content.split('\n');
      const body = lines.map((line) => `+${line}`).join('\n');
      chunks.push(
        [
          `diff --git a/${file} b/${file}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${file}`,
          `@@ -0,0 +1,${lines.length} @@`,
          body,
          '',
        ].join('\n'),
      );
    } catch {
      chunks.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ missing @@\n`);
    }
  }
  return chunks.join('\n');
}

/** @param {Buffer} buffer */
function isBinaryBuffer(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

/**
 * @param {string} root
 * @param {string} relativePath
 */
function hashIfFile(root, relativePath) {
  try {
    const abs = join(root, relativePath);
    const stat = statSync(abs);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_COPY_BYTES) return `meta:${stat.size}`;
    return createHash('sha256').update(readFileSync(abs)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string} name
 * @param {string} docsDir
 * @param {Array<{ path: string, sha256: string }>} included
 * @param {string} specId
 */
function copyAuthorizedDoc(root, name, docsDir, included, specId) {
  const src = join(root, '.agent', 'specs', specId, name);
  if (!existsSync(src)) {
    throw new StateMachineError(`Documento autorizado ausente: ${name}.`, {
      guard: 'review-package',
      nextAction: `Restaure .agent/specs/${specId}/${name}.`,
    });
  }
  const rel = `docs/${name}`;
  const content = readFileSync(src, 'utf8');
  writeFileSync(join(docsDir, name), content, 'utf8');
  included.push({ path: rel, sha256: sha256(content) });
}

/**
 * @param {string} root
 * @param {string} repoRelative
 * @param {string} docsDir
 * @param {Array<{ path: string, sha256: string }>} included
 */
function copyRepoDoc(root, repoRelative, docsDir, included) {
  const src = join(root, repoRelative);
  if (!existsSync(src)) {
    throw new StateMachineError(`Documento autorizado ausente: ${repoRelative}.`, {
      guard: 'review-package',
      nextAction: `Restaure ${repoRelative}.`,
    });
  }
  const name = repoRelative.split('/').pop() ?? 'doc.md';
  const rel = `docs/${name}`;
  const content = readFileSync(src, 'utf8');
  writeFileSync(join(docsDir, name), content, 'utf8');
  included.push({ path: rel, sha256: sha256(content) });
}

/**
 * @param {string} taskFile
 * @param {string} docsDir
 * @param {Array<{ path: string, sha256: string }>} included
 */
function copyTaskDoc(taskFile, docsDir, included) {
  const content = readFileSync(taskFile, 'utf8');
  const name = taskFile.split(/[\\/]/).pop() ?? 'task.md';
  const rel = `docs/${name}`;
  writeFileSync(join(docsDir, name), content, 'utf8');
  included.push({ path: rel, sha256: sha256(content) });
}

/**
 * @param {string} root
 * @param {Array<{ path: string, status: string }>} files
 * @param {string} destDir
 * @param {Array<{ path: string, sha256: string }>} included
 */
function copyRelevantChangedFiles(root, files, destDir, included) {
  mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    const path = file.path;
    if (!(
      path.startsWith('scripts/agentctl/')
      || path.startsWith('.agent/')
      || path.startsWith('tests/unit/agentctl/')
      || path === 'agentctl'
    )) {
      continue;
    }
    const src = join(root, path);
    if (!existsSync(src)) continue;
    try {
      const stat = statSync(src);
      if (!stat.isFile() || stat.size > MAX_COPY_BYTES) continue;
      const rel = `changed/${path}`;
      const abs = join(destDir, path);
      mkdirSync(dirname(abs), { recursive: true });
      copyFileSync(src, abs);
      included.push({ path: rel, sha256: sha256(readFileSync(abs, 'utf8')) });
    } catch {
      // ignore unreadable
    }
  }
}

/**
 * @param {string} taskFile
 */
function buildAcceptanceCriteria(taskFile) {
  const text = readFileSync(taskFile, 'utf8');
  const match = /## Criterios de aceitacao\n([\s\S]*?)(\n## |$)/.exec(text);
  const body = match ? match[1].trim() : 'Criterios de aceitacao nao encontrados no arquivo da tarefa.';
  return `# Criterios de aceitacao\n\n${body}\n`;
}

/**
 * @param {Record<string, unknown>} state
 */
function buildApprovalSummary(state) {
  const approval = /** @type {Record<string, unknown>} */ (state.approval ?? {});
  const integrity = /** @type {Record<string, unknown> | null} */ (approval.integrity ?? null);
  return {
    approval_status: approval.status ?? null,
    has_integrity: Boolean(integrity),
    integrity_ok: Boolean(
      integrity
      && typeof integrity.digest === 'string'
      && Array.isArray(integrity.manifest),
    ),
    digest: integrity && typeof integrity.digest === 'string' ? integrity.digest : null,
    approved_by: integrity && typeof integrity.approved_by === 'string'
      ? integrity.approved_by
      : null,
    approved_at: integrity && typeof integrity.approved_at === 'string'
      ? integrity.approved_at
      : null,
    manifest_count: integrity && Array.isArray(integrity.manifest) ? integrity.manifest.length : 0,
  };
}

/**
 * @param {{
 *   axis: string,
 *   specId: string,
 *   taskId: string,
 *   fixedPoint: string,
 *   packageId: string,
 * }} input
 */
function buildReviewPrompt(input) {
  const other = input.axis === 'spec-compliance' ? 'engineering-quality' : 'spec-compliance';
  if (input.axis === 'spec-compliance') {
    return [
      '# Review prompt — spec-compliance',
      '',
      `spec_id: ${input.specId}`,
      `task_id: ${input.taskId}`,
      `axis: ${input.axis}`,
      `fixed_point: ${input.fixedPoint}`,
      `package_id: ${input.packageId}`,
      '',
      'Revise somente os artefatos deste pacote.',
      'Nao abra arquivos fora do pacote.',
      'Nao modifique codigo.',
      `Nao leia nem mencione o relatorio do eixo ${other} nem o aggregate.`,
      '',
      'Perguntas centrais:',
      '- a implementacao corresponde a SPEC, ao PLAN e a tarefa?',
      '- todos os criterios de aceitacao foram atendidos?',
      '- houve ampliacao indevida de escopo?',
      '- algo aprovado foi omitido ou contradito?',
      '',
      'Produza Markdown com frontmatter schema_version 2 e bloco JSON estrito de findings.',
      '',
    ].join('\n');
  }
  return [
    '# Review prompt — engineering-quality',
    '',
    `spec_id: ${input.specId}`,
    `task_id: ${input.taskId}`,
    `axis: ${input.axis}`,
    `fixed_point: ${input.fixedPoint}`,
    `package_id: ${input.packageId}`,
    '',
    'Revise somente os artefatos deste pacote.',
    'Nao abra arquivos fora do pacote.',
    'Nao modifique codigo.',
    `Nao leia nem mencione o relatorio do eixo ${other} nem o aggregate.`,
    '',
    'Perguntas centrais:',
    '- o codigo e correto, seguro e manutivel?',
    '- existem bypasses, estados parciais ou problemas de atomicidade?',
    '- fixed point, evidencias e relatorios sao tratados corretamente?',
    '- os testes cobrem falhas e casos adversariais?',
    '- houve regressao no lifecycle existente?',
    '',
    'Produza Markdown com frontmatter schema_version 2 e bloco JSON estrito de findings.',
    '',
  ].join('\n');
}

/**
 * @param {{
 *   axis: string,
 *   fixedPoint: string,
 *   gitHead: string,
 *   baseCommit: string,
 *   included: Array<{ path: string, sha256: string }>,
 * }} input
 */
function computePackageFingerprint(input) {
  const lines = input.included
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => `${item.path}:${item.sha256}`);
  return sha256([
    input.axis,
    input.fixedPoint,
    input.gitHead,
    input.baseCommit,
    ...lines,
  ].join('\n'));
}

/**
 * @param {string} root
 * @param {string[]} args
 */
function runGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new StateMachineError(`Falha Git no pacote de review (${args.join(' ')}).`, {
      guard: 'git-exec',
      nextAction: 'Verifique o repositorio Git antes de preparar o review.',
    });
  }
  return result.stdout ?? '';
}

/** @param {string} value */
function toPosix(value) {
  return value.split('\\').join('/');
}

/**
 * Grava relatorio canonico atomicamente.
 * @param {string} targetPath
 * @param {string} content
 */
export function writeCanonicalReviewAtomic(targetPath, content) {
  writeTextAtomic(targetPath, content);
}

/**
 * Hash SHA-256 de arquivo em disco.
 * @param {string} path
 */
export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
