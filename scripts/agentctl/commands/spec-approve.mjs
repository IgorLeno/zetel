import { assertTransition, StateMachineError, validateState } from '../domain/state-machine.mjs';
import { aggregateDigest, checkTaskCoherence, checkTemplateSections, collectApprovalArtifacts } from '../domain/spec-artifacts.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { dirname } from 'node:path';
import { HASH_ALGORITHM, HASH_FORMAT_VERSION, isHumanApprover, validateIntegrityRecord } from '../domain/spec-integrity.mjs';
import { writeError } from '../infra/write-error.mjs';


/** @param {string[]} args @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io] */
export function runSpecApprove(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { specId, approvedBy, reapprove, kind: requestedKind } = parseApproveArgs(args);
    const { state, path, validation } = loadSpecState(specId, { cwd: io.cwd });
    if (!validation.ok) throw new StateMachineError(validation.errors.join(' '), { guard: 'state-invalid', nextAction: 'Corrija o estado via comandos agentctl antes de aprovar.' });
    if (state.spec.id !== specId) throw new StateMachineError('state.json diverge do id solicitado.', { guard: 'spec-id', nextAction: 'Use o id registrado em state.json.' });
    const hasIntegrity = Object.prototype.hasOwnProperty.call(state.approval, 'integrity');
    const legacy = isRecognizableLegacyApproval(state, hasIntegrity);
    if (!reapprove && legacy) {
      throw new StateMachineError('approval legada exige migracao explicita com --reapprove.', {
        guard: 'reapprove-required', nextAction: 'Repita com --reapprove e, se spec.kind estiver ausente, --kind <mini|full>.',
      });
    }
    if (!reapprove && hasIntegrity) {
      throw new StateMachineError('spec ja possui aprovacao com integridade.', { guard: 'already-approved', nextAction: 'Crie uma nova revisao de spec para alterar a aprovacao.' });
    }
    if (reapprove && hasIntegrity) {
      throw new StateMachineError('reapproval nao pode sobrescrever uma approval com integridade.', { guard: 'already-approved', nextAction: 'Crie uma nova revisao de spec para alterar uma aprovacao integra.' });
    }
    if (reapprove && !legacy) {
      throw new StateMachineError('reapproval exige uma approval legada reconhecivel em status APPROVED.', { guard: 'reapprove-mode', nextAction: 'Use aprovacao normal em READY_FOR_APPROVAL ou restaure os metadados legados validos.' });
    }
    if (!reapprove && state.spec.status !== 'READY_FOR_APPROVAL') throw new StateMachineError(`spec nao esta pronta para aprovacao: ${state.spec.status}.`, { guard: 'spec-status', nextAction: 'Preencha a spec e mova-a para READY_FOR_APPROVAL antes de aprovar.' });
    if (!reapprove && requestedKind !== null) {
      throw new StateMachineError('--kind e permitido somente com --reapprove.', { guard: 'reapprove-mode', nextAction: 'Remova --kind da aprovacao normal.' });
    }
    const kind = resolveApprovalKind(state.spec.kind, requestedKind, reapprove);
    const specDir = dirname(path);
    const artifacts = collectApprovalArtifacts(specDir);
    const coherence = checkTaskCoherence(specDir, state);
    const templateSections = reapprove ? [] : checkTemplateSections(specDir, kind);
    const readiness = [...artifacts.readinessIssues, ...coherence, ...templateSections];
    if (artifacts.missing.length || artifacts.openMarkers.length || readiness.length) {
      throw new StateMachineError('spec ainda nao esta aprovavel.', {
        guard: 'approval-readiness',
        nextAction: describeReadiness(artifacts, readiness),
      });
    }
    if (!reapprove) assertTransition('spec', state.spec.status, 'APPROVED');
    const approvedAt = new Date().toISOString();
    const integrity = {
      algorithm: HASH_ALGORITHM,
      format_version: HASH_FORMAT_VERSION,
      manifest: artifacts.manifest,
      digest: aggregateDigest(artifacts.manifest),
      kind,
      confirmed_human: true,
      approved_by: approvedBy,
      approved_at: approvedAt,
    };
    const nextSpec = { ...state.spec, kind, status: 'APPROVED', approved_by: approvedBy, approved_at: approvedAt };
    const integrityValidation = validateIntegrityRecord(integrity, nextSpec);
    if (!integrityValidation.ok) throw new StateMachineError(integrityValidation.issues.join('; '), { guard: 'approval-integrity', nextAction: 'Corrija o registro de aprovacao antes de escrever.' });
    const next = {
      ...state,
      spec: nextSpec,
      approval: {
        ...state.approval,
        spec: true,
        plan: true,
        tasks: true,
        architecture_decisions: true,
        ...(reapprove ? { legacy_approval: legacyApprovalMetadata(state, approvedAt) } : {}),
        integrity,
      },
    };
    const nextValidation = validateState(next);
    if (!nextValidation.ok) throw new StateMachineError(nextValidation.errors.join(' '), { guard: 'state-invalid', nextAction: 'Corrija a transicao antes de escrever a aprovacao.' });
    writeJsonAtomic(path, next, { expectedRevision: state.revision });
    stdout.write(`spec aprovada: ${specId}\napproved_by: ${approvedBy}\ndigest: ${integrity.digest}\n`);
    return 0;
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseApproveArgs(args) {
  const [specId, ...flags] = args;
  if (!specId) {
    throw new StateMachineError('Uso: ./agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human [--reapprove] [--kind <mini|full>].', { guard: 'usage', nextAction: 'Informe a identidade humana e confirme explicitamente.' });
  }
  assertSafeSpecId(specId);
  let approvedBy = null;
  let confirmedHuman = false;
  let reapprove = false;
  let kind = null;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--approved-by') {
      const value = flags[index + 1];
      if (approvedBy !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --approved-by exige exatamente uma identidade nao-flag.', { guard: 'usage', nextAction: 'Informe --approved-by seguido da identidade humana.' });
      }
      approvedBy = value;
      index += 1;
    } else if (flag === '--confirm-human') {
      if (confirmedHuman) throw new StateMachineError('Uso: --confirm-human nao pode ser repetido.', { guard: 'usage', nextAction: 'Informe a confirmacao humana uma unica vez.' });
      confirmedHuman = true;
    } else if (flag === '--reapprove') {
      if (reapprove) throw new StateMachineError('Uso: --reapprove nao pode ser repetido.', { guard: 'usage', nextAction: 'Informe --reapprove uma unica vez.' });
      reapprove = true;
    } else if (flag === '--kind') {
      const value = flags[index + 1];
      if (kind !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --kind exige exatamente um valor mini ou full.', { guard: 'usage', nextAction: 'Informe --kind mini ou --kind full uma unica vez.' });
      }
      if (value !== 'mini' && value !== 'full') {
        throw new StateMachineError('Uso: --kind aceita apenas mini ou full.', { guard: 'usage', nextAction: 'Informe --kind mini ou --kind full.' });
      }
      kind = value;
      index += 1;
    } else {
      throw new StateMachineError(`Uso: flag ou argumento desconhecido: ${flag}.`, { guard: 'usage', nextAction: 'Use apenas --approved-by, --confirm-human, --reapprove e --kind.' });
    }
  }
  if (approvedBy === null || !confirmedHuman) throw new StateMachineError('Uso: ./agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human [--reapprove] [--kind <mini|full>].', { guard: 'usage', nextAction: 'Informe a identidade humana e confirme explicitamente.' });
  if (!isHumanApprover(approvedBy)) {
    throw new StateMachineError('approved-by deve identificar uma pessoa humana e nao pode ser vazio.', { guard: 'approved-by', nextAction: 'Informe a identidade humana que aprovou a spec.' });
  }
  return { specId, approvedBy: approvedBy.trim(), reapprove, kind };
}

/** @param {{ missing: string[], openMarkers: string[] }} artifacts @param {string[]} readiness */
function describeReadiness(artifacts, readiness) {
  const items = [];
  if (artifacts.missing.length) items.push(`crie: ${artifacts.missing.join(', ')}`);
  if (artifacts.openMarkers.length) items.push(`preencha marcadores em: ${artifacts.openMarkers.join(', ')}`);
  if (readiness.length) items.push(readiness.join('; '));
  return `Complete os artefatos antes de aprovar (${items.join(' | ')}).`;
}

/** @param {any} state @param {boolean} hasIntegrity */
function isRecognizableLegacyApproval(state, hasIntegrity) {
  return !hasIntegrity
    && state.spec.status === 'APPROVED'
    && state.approval?.spec === true
    && (isHumanApprover(state.spec.approved_by) || typeof state.spec.approved_at === 'string');
}

/** @param {unknown} stateKind @param {'mini'|'full'|null} requestedKind @param {boolean} reapprove */
function resolveApprovalKind(stateKind, requestedKind, reapprove) {
  if (stateKind === 'mini' || stateKind === 'full') {
    if (reapprove && requestedKind !== null && requestedKind !== stateKind) {
      throw new StateMachineError(`--kind ${requestedKind} diverge de spec.kind ${stateKind}.`, { guard: 'spec-kind', nextAction: `Use --kind ${stateKind} ou omita a flag.` });
    }
    return stateKind;
  }
  if (reapprove && requestedKind !== null) return requestedKind;
  throw new StateMachineError('state.json nao informa um kind de spec suportado.', { guard: 'spec-kind', nextAction: reapprove ? 'Informe --kind <mini|full> para migrar a approval legada.' : 'Use kind mini ou full antes de aprovar.' });
}

/** @param {any} state @param {string} migratedAt */
function legacyApprovalMetadata(state, migratedAt) {
  return {
    ...(state.spec.approved_by != null ? { approved_by: state.spec.approved_by } : {}),
    ...(state.spec.approved_at != null ? { approved_at: state.spec.approved_at } : {}),
    status: state.spec.status,
    migrated_at: migratedAt,
    reason: 'integrity-envelope-migration',
  };
}
