import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { StateMachineError } from './state-machine.mjs';
import { canonicalizeArtifact, sha256 } from './spec-artifacts.mjs';

export const EVIDENCE_SCHEMA_VERSION = 1;

/**
 * Artefatos operacionais do workflow nao invalidam o fixed point da validacao.
 * Reviews/evidence/handoffs nascem depois do validate e sao checados a parte.
 * state.json muda a cada transicao operacional e tambem fica de fora do tree hash.
 * @param {string} relativePath
 */
function isWorkflowOperationalPath(relativePath) {
  const path = relativePath.split('\\').join('/');
  return (
    /(^|\/)evidence\//.test(path)
    || /(^|\/)reviews\//.test(path)
    || /(^|\/)handoffs\//.test(path)
    || /(^|\/)tasks\/[^/]+\.md$/.test(path)
    || /(^|\/)state\.json$/.test(path)
    || path.endsWith('state.json.lock')
    || path.includes('.agentctl-fake-bin/')
  );
}

/**
 * @param {string} root
 * @param {string[]} args
 */
function runGitDiffExcludingOperational(root, args) {
  return runGit(root, [
    ...args,
    '--',
    '.',
    ':(exclude).agent/specs/*/state.json',
    ':(exclude).agent/specs/*/tasks/**',
    ':(exclude).agent/specs/*/evidence/**',
    ':(exclude).agent/specs/*/reviews/**',
    ':(exclude).agent/specs/*/handoffs/**',
  ]);
}

/**
 * @param {string} root
 */
export function captureWorkspaceFingerprint(root) {
  const head = runGit(root, ['rev-parse', 'HEAD']).trim();
  const trackedDiff = runGitDiffExcludingOperational(root, ['diff', 'HEAD']);
  const stagedDiff = runGitDiffExcludingOperational(root, ['diff', '--cached']);
  const untracked = runGit(root, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .filter((file) => !isWorkflowOperationalPath(file))
    .sort();
  /** @type {string[]} */
  const untrackedHashes = [];
  for (const file of untracked) {
    if (file.includes('\0')) continue;
    // Evita varredura de binarios/secrets: hasheia caminho + tamanho + amostra limitada.
    const abs = join(root, file);
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > 1_000_000) {
        untrackedHashes.push(`${file}:meta:${stat.size}`);
        continue;
      }
      const content = readFileSync(abs);
      untrackedHashes.push(`${file}:${sha256(content.toString('utf8'))}`);
    } catch {
      untrackedHashes.push(`${file}:missing`);
    }
  }

  const treeMaterial = [
    `head:${head}`,
    `tracked:${sha256(trackedDiff)}`,
    `staged:${sha256(stagedDiff)}`,
    `untracked:${sha256(untrackedHashes.join('\n'))}`,
  ].join('\n');

  return {
    git_head: head,
    tree_fingerprint: sha256(treeMaterial),
    tracked_diff_sha256: sha256(trackedDiff),
    staged_diff_sha256: sha256(stagedDiff),
    untracked_sha256: sha256(untrackedHashes.join('\n')),
  };
}

/**
 * @param {string} taskFile
 * @param {string} profile
 * @param {unknown} plan
 */
export function captureDefinitionFingerprint(taskFile, profile, plan) {
  const taskText = existsSync(taskFile)
    ? canonicalizeArtifact(`tasks/${taskFile.split(/[\\/]/).pop() ?? 'task.md'}`, readFileSync(taskFile, 'utf8'))
    : '';
  return {
    task_fingerprint: sha256(taskText),
    plan_fingerprint: sha256(JSON.stringify(plan)),
    profile,
  };
}

/**
 * @param {{
 *   taskId: string,
 *   profile: string,
 *   revision: number,
 *   workspace: ReturnType<typeof captureWorkspaceFingerprint>,
 *   definition: ReturnType<typeof captureDefinitionFingerprint>,
 *   commands: Array<Record<string, unknown>>,
 *   waivers?: Array<Record<string, unknown>>,
 * }} input
 */
export function buildValidationEvidence(input) {
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    task_id: input.taskId,
    execution_profile: input.profile,
    state_revision: input.revision,
    git_head: input.workspace.git_head,
    tree_fingerprint: input.workspace.tree_fingerprint,
    tracked_diff_sha256: input.workspace.tracked_diff_sha256,
    staged_diff_sha256: input.workspace.staged_diff_sha256,
    untracked_sha256: input.workspace.untracked_sha256,
    task_fingerprint: input.definition.task_fingerprint,
    plan_fingerprint: input.definition.plan_fingerprint,
    fixed_point: buildFixedPoint({
      git_head: input.workspace.git_head,
      tree_fingerprint: input.workspace.tree_fingerprint,
      task_fingerprint: input.definition.task_fingerprint,
      plan_fingerprint: input.definition.plan_fingerprint,
      profile: input.profile,
    }),
    commands: input.commands,
    waivers: input.waivers ?? [],
    recorded_at: new Date().toISOString(),
  };
}

/**
 * @param {{
 *   git_head: string,
 *   tree_fingerprint: string,
 *   task_fingerprint: string,
 *   plan_fingerprint: string,
 *   profile: string,
 * }} parts
 */
export function buildFixedPoint(parts) {
  return sha256([
    parts.git_head,
    parts.tree_fingerprint,
    parts.task_fingerprint,
    parts.plan_fingerprint,
    parts.profile,
  ].join('|'));
}

/**
 * @param {string} specDir
 * @param {string} taskId
 * @param {Record<string, unknown>} evidence
 */
export function writeValidationEvidence(specDir, taskId, evidence) {
  const path = join(specDir, 'evidence', `${taskId}-validation.json`);
  writeTextAtomic(path, `${JSON.stringify(evidence, null, 2)}\n`);
  return path;
}

/**
 * @param {string} specDir
 * @param {string} taskId
 */
export function readValidationEvidence(specDir, taskId) {
  const path = join(specDir, 'evidence', `${taskId}-validation.json`);
  if (!existsSync(path)) {
    throw new StateMachineError(`Evidencia de validacao ausente para ${taskId}.`, {
      guard: 'evidence-missing',
      nextAction: 'Execute task validate com sucesso antes de task close.',
    });
  }
  try {
    return { path, evidence: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    throw new StateMachineError(`Evidencia de validacao corrompida para ${taskId}.`, {
      guard: 'evidence-corrupt',
      nextAction: 'Regenere a evidencia com task validate.',
    });
  }
}

/**
 * @param {Record<string, unknown>} evidence
 * @param {{
 *   root: string,
 *   taskFile: string,
 *   profile: string,
 *   plan: unknown,
 * }} current
 */
export function assertEvidenceFresh(evidence, current) {
  if (!evidence || evidence.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    throw new StateMachineError('Evidencia com schema invalido.', {
      guard: 'evidence-stale',
      nextAction: 'Regenere a evidencia com task validate.',
    });
  }
  const workspace = captureWorkspaceFingerprint(current.root);
  const definition = captureDefinitionFingerprint(current.taskFile, current.profile, current.plan);
  const expectedFixedPoint = buildFixedPoint({
    git_head: workspace.git_head,
    tree_fingerprint: workspace.tree_fingerprint,
    task_fingerprint: definition.task_fingerprint,
    plan_fingerprint: definition.plan_fingerprint,
    profile: current.profile,
  });

  if (evidence.fixed_point !== expectedFixedPoint) {
    throw new StateMachineError('Evidencia stale: fingerprint divergente do working tree atual.', {
      guard: 'evidence-stale',
      nextAction: 'Reexecute task validate apos estabilizar o fixed point.',
    });
  }
  if (evidence.git_head !== workspace.git_head) {
    throw new StateMachineError('Evidencia stale: HEAD mudou.', {
      guard: 'evidence-stale',
      nextAction: 'Reexecute task validate no HEAD atual.',
    });
  }
  if (evidence.execution_profile !== current.profile) {
    throw new StateMachineError('Evidencia stale: perfil mudou.', {
      guard: 'evidence-stale',
      nextAction: 'Reexecute task validate com o perfil atual.',
    });
  }
  return { workspace, definition, fixedPoint: expectedFixedPoint };
}

/**
 * @param {Record<string, unknown>} evidence
 * @param {Array<{ category: string, argv: string[] }>} requiredPlan
 */
export function assertApplicableGatesPassed(evidence, requiredPlan) {
  const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
  const waivers = Array.isArray(evidence.waivers) ? evidence.waivers : [];

  for (const required of requiredPlan) {
    const key = commandKey(required.category, required.argv);
    const match = commands.find((item) =>
      item && commandKey(String(item.category), /** @type {string[]} */ (item.argv ?? [])) === key);
    if (!match) {
      throw new StateMachineError(`Gate ausente na evidencia: ${required.category}.`, {
        guard: 'gate-missing',
        nextAction: 'Reexecute task validate incluindo todos os gates aplicaveis.',
      });
    }
    const exitCode = Number(match.exit_code);
    const result = String(match.result ?? '');
    if (exitCode === 0 && result === 'PASS') continue;

    const waiver = waivers.find((item) =>
      item && commandKey(String(item.category), /** @type {string[]} */ (item.argv ?? [])) === key);
    if (!waiver) {
      throw new StateMachineError(
        `Gate aplicavel falhou sem waiver: ${required.category} (exit ${exitCode}).`,
        {
          guard: 'gate-failed',
          nextAction: 'Corrija a falha e reexecute task validate, ou registre waiver humano valido.',
        },
      );
    }
    assertValidWaiver(waiver, match);
  }
}

/**
 * @param {Record<string, unknown>} waiver
 * @param {Record<string, unknown>} command
 */
export function assertValidWaiver(waiver, command) {
  if (String(command.result) === 'PASS' || Number(command.exit_code) === 0) {
    throw new StateMachineError('Waiver nao pode acompanhar resultado PASS.', {
      guard: 'waiver-invalid',
      nextAction: 'Remova o waiver ou preserve o resultado original de falha.',
    });
  }
  if (String(waiver.original_result) === 'PASS' || Number(waiver.original_exit_code) === 0) {
    throw new StateMachineError('Waiver nao pode mascarar falha convertendo resultado original em PASS.', {
      guard: 'waiver-invalid',
      nextAction: 'Preserve original_result/original_exit_code da falha.',
    });
  }
  if (Number(waiver.original_exit_code) !== Number(command.exit_code)) {
    throw new StateMachineError('Waiver nao corresponde ao exit_code original do gate.', {
      guard: 'waiver-invalid',
      nextAction: 'Regenere o waiver para o resultado original do comando.',
    });
  }
  if (typeof waiver.approved_by !== 'string' || !String(waiver.approved_by).trim()) {
    throw new StateMachineError('Waiver exige identidade humana.', {
      guard: 'waiver-invalid',
      nextAction: 'Informe approved_by humano no waiver do gate.',
    });
  }
  if (typeof waiver.justification !== 'string' || !String(waiver.justification).trim()) {
    throw new StateMachineError('Waiver exige justificativa.', {
      guard: 'waiver-invalid',
      nextAction: 'Informe justification no waiver do gate.',
    });
  }
  const joined = (Array.isArray(command.argv) ? command.argv : []).join(' ').toLowerCase();
  if (joined.includes('e2e:live') || joined.includes('openrouter')) {
    throw new StateMachineError('Waiver nao pode liberar E2E live/OpenRouter.', {
      guard: 'waiver-invalid',
      nextAction: 'Remova E2E live do plano; ele permanece fora dos gates padrao.',
    });
  }
}

/**
 * @param {string} category
 * @param {string[]} argv
 */
function commandKey(category, argv) {
  return `${category}|${JSON.stringify(argv)}`;
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
    throw new StateMachineError(`Falha ao coletar fingerprint Git (${args.join(' ')}).`, {
      guard: 'git-exec',
      nextAction: 'Verifique o repositorio Git antes de validar evidencias.',
    });
  }
  return result.stdout ?? '';
}

/**
 * Hash curto deterministico para testes.
 * @param {string} value
 */
export function shortHash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}

/**
 * Lista arquivos de review versionados da tarefa.
 * @param {string} specDir
 * @param {string} taskId
 */
export function listReviewFiles(specDir, taskId) {
  const dir = join(specDir, 'reviews');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${taskId}-`) && name.endsWith('.md'))
    .filter((name) => !name.includes('gates') && !name.includes('findings-resolution'))
    .map((name) => join(dir, name))
    .sort();
}

/**
 * @param {string} path
 * @param {string} from
 */
export function toPosixRelative(path, from) {
  return relative(from, path).split('\\').join('/');
}
