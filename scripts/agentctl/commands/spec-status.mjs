import { loadSpecState } from '../infra/read-state.mjs';
import { findActiveTasks, isTaskBlockedByDependencies } from '../domain/state-machine.mjs';
import { aggregateDigest, checkTaskCoherence, collectApprovalArtifacts } from '../domain/spec-artifacts.mjs';
import { dirname } from 'node:path';
import { validateIntegrityRecord } from '../domain/spec-integrity.mjs';

/**
 * Comando somente leitura: apresenta status sem modificar arquivos.
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 * @returns {number} exit code
 */
export function runSpecStatus(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const specId = args[0];

  if (!specId) {
    stderr.write(
      [
        'Uso: agentctl spec status <spec-id>',
        'guard: usage',
        'nextAction: informe o id da spec, por exemplo SPEC-000-agent-workflow-pilot.',
        '',
      ].join('\n'),
    );
    return 2;
  }

  try {
    const { state, validation, path } = loadSpecState(specId, { cwd: io.cwd });

    if (!validation.ok) {
      stderr.write(`Estado invalido em ${path}\n`);
      for (const issue of validation.issues ?? []) {
        stderr.write(`- ${issue.message}\n`);
        stderr.write(`  guard: ${issue.guard}\n`);
        stderr.write(`  nextAction: ${issue.nextAction}\n`);
      }
      if (!validation.issues?.length) {
        for (const error of validation.errors) {
          stderr.write(`- ${error}\n`);
        }
      }
      stderr.write(
        'Proxima acao: corrija state.json via comandos agentctl; nao edite saltos manuais.\n',
      );
      return 1;
    }

    const active = findActiveTasks(state);
    const approval = inspectApproval(path, state);
    const lines = [
      `spec: ${state.spec.id}`,
      `kind: ${state.spec.kind ?? '-'}`,
      `status: ${state.spec.status}`,
      `workflow_status: ${state.spec.status}`,
      `approval_status: ${approval.status}`,
      `revision: ${state.revision}`,
      `active_task: ${state.active_task ?? '-'}`,
      `session: ${state.session?.status ?? '-'}`,
      `approved_by: ${approval.approvedBy ?? '-'}`,
      `approved_at: ${approval.approvedAt ?? '-'}`,
      `hash_algorithm: ${approval.algorithm ?? '-'}`,
      `hash_format_version: ${approval.formatVersion ?? '-'}`,
      `registered_digest: ${approval.registeredDigest ?? '-'}`,
      `current_digest: ${approval.currentDigest ?? '-'}`,
      `missing_artifacts: ${approval.missing.join(', ') || '-'}`,
      `changed_artifacts: ${approval.changed.join(', ') || '-'}`,
      `open_approval_markers: ${approval.openMarkers.join(', ') || '-'}`,
      'tasks:',
    ];

    for (const task of state.tasks) {
      const blocked = isTaskBlockedByDependencies(task, state.tasks);
      const flags = [];
      flags.push(`blocked_by: ${task.blocked_by.join(', ') || '-'}`);
      if (blocked) flags.push('blocked_by_deps');
      if (active.some((item) => item.id === task.id)) flags.push('active');
      const suffix = flags.length ? ` [${flags.join(', ')}]` : '';
      lines.push(`  - ${task.id}: ${task.status}${suffix}`);
    }

    lines.push(`next_action: ${approval.nextAction}`);
    stdout.write(`${lines.join('\n')}\n`);
    return approval.status === 'APPROVED' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const guard =
      error && typeof error === 'object' && 'guard' in error
        ? String(/** @type {{ guard?: string }} */ (error).guard)
        : 'runtime';
    const next =
      error && typeof error === 'object' && 'nextAction' in error
        ? String(/** @type {{ nextAction?: string }} */ (error).nextAction)
        : 'Verifique o estado e tente novamente.';
    stderr.write(`${message}\nguard: ${guard}\nnextAction: ${next}\n`);
    return 1;
  }
}

/** @param {string} statePath @param {any} state */
function inspectApproval(statePath, state) {
  const integrity = state.approval?.integrity;
  const specDir = dirname(statePath);
  const current = collectApprovalArtifacts(specDir);
  const coherence = checkTaskCoherence(specDir, state);
  if (!integrity || !Array.isArray(integrity.manifest) || typeof integrity.digest !== 'string') {
    const legacy = state.spec.status === 'APPROVED' || state.approval?.spec === true;
    return {
      status: legacy ? 'LEGACY_UNVERIFIED' : 'PENDING',
      approvedBy: state.spec.approved_by ?? null,
      approvedAt: state.spec.approved_at ?? null,
      algorithm: null, formatVersion: null, registeredDigest: null, currentDigest: null,
      missing: current.missing, changed: coherence, openMarkers: current.openMarkers,
      nextAction: legacy
        ? 'Solicite reaprovação humana para registrar um manifest de integridade.'
        : 'Preencha os artefatos e marcadores e execute spec approve com --confirm-human.',
    };
  }
  const integrityValidation = validateIntegrityRecord(integrity, state.spec);
  if (!integrityValidation.ok) {
    return {
      status: 'TAMPERED',
      approvedBy: integrity.approved_by ?? state.spec.approved_by ?? null,
      approvedAt: integrity.approved_at ?? state.spec.approved_at ?? null,
      algorithm: integrity.algorithm ?? null,
      formatVersion: integrity.format_version ?? null,
      registeredDigest: integrity.digest ?? null,
      currentDigest: null,
      missing: current.missing,
      changed: integrityValidation.issues.map((issue) => `approval.integrity: ${issue}`),
      openMarkers: current.openMarkers,
      nextAction: 'Solicite nova aprovacao humana com um registro de integridade valido.',
    };
  }
  const expected = new Map(integrity.manifest.map((entry) => [entry.path, entry.sha256]));
  const actual = new Map(current.manifest.map((entry) => [entry.path, entry.sha256]));
  const changed = [];
  for (const [artifactPath, digest] of expected) {
    if (!actual.has(artifactPath) || actual.get(artifactPath) !== digest) changed.push(artifactPath);
  }
  for (const artifactPath of actual.keys()) if (!expected.has(artifactPath)) changed.push(artifactPath);
  const currentDigest = aggregateDigest(current.manifest);
  const tampered = current.missing.length > 0 || changed.length > 0 || coherence.length > 0 || current.openMarkers.length > 0 || currentDigest !== integrity.digest;
  return {
    status: tampered ? 'TAMPERED' : 'APPROVED',
    approvedBy: integrity.approved_by ?? state.spec.approved_by ?? null,
    approvedAt: integrity.approved_at ?? state.spec.approved_at ?? null,
    algorithm: integrity.algorithm ?? null,
    formatVersion: integrity.format_version ?? null,
    registeredDigest: integrity.digest,
    currentDigest,
    missing: current.missing,
    changed: [...new Set([...changed, ...coherence])].sort(),
    openMarkers: current.openMarkers,
    nextAction: tampered
      ? 'Restaure os artefatos aprovados ou solicite nova aprovacao humana.'
      : 'Aprovacao integra; prossiga apenas com tarefas liberadas.',
  };
}
