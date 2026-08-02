import { assertTransition, StateMachineError, validateState } from '../domain/state-machine.mjs';
import { aggregateDigest, checkTaskCoherence, collectApprovalArtifacts } from '../domain/spec-artifacts.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { dirname } from 'node:path';
import { HASH_ALGORITHM, HASH_FORMAT_VERSION, isHumanApprover, validateIntegrityRecord } from '../domain/spec-integrity.mjs';


/** @param {string[]} args @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io] */
export function runSpecApprove(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { specId, approvedBy } = parseApproveArgs(args);
    const { state, path, validation } = loadSpecState(specId, { cwd: io.cwd });
    if (!validation.ok) throw new StateMachineError(validation.errors.join(' '), { guard: 'state-invalid', nextAction: 'Corrija o estado via comandos agentctl antes de aprovar.' });
    if (state.spec.id !== specId) throw new StateMachineError('state.json diverge do id solicitado.', { guard: 'spec-id', nextAction: 'Use o id registrado em state.json.' });
    if (state.spec.kind !== 'mini' && state.spec.kind !== 'full') throw new StateMachineError('state.json nao informa um kind de spec suportado.', { guard: 'spec-kind', nextAction: 'Use kind mini ou full antes de aprovar.' });
    if (state.spec.status !== 'READY_FOR_APPROVAL') throw new StateMachineError(`spec nao esta pronta para aprovacao: ${state.spec.status}.`, { guard: 'spec-status', nextAction: 'Preencha a spec e mova-a para READY_FOR_APPROVAL antes de aprovar.' });
    if (state.approval?.integrity) throw new StateMachineError('spec ja possui aprovacao com integridade.', { guard: 'already-approved', nextAction: 'Crie uma nova revisao de spec para alterar a aprovacao.' });
    const specDir = dirname(path);
    const artifacts = collectApprovalArtifacts(specDir);
    const coherence = checkTaskCoherence(specDir, state);
    if (artifacts.missing.length || artifacts.openMarkers.length || coherence.length) {
      throw new StateMachineError('spec ainda nao esta aprovavel.', {
        guard: 'approval-readiness',
        nextAction: describeReadiness(artifacts, coherence),
      });
    }
    assertTransition('spec', state.spec.status, 'APPROVED');
    const approvedAt = new Date().toISOString();
    const integrity = {
      algorithm: HASH_ALGORITHM,
      format_version: HASH_FORMAT_VERSION,
      manifest: artifacts.manifest,
      digest: aggregateDigest(artifacts.manifest),
      kind: state.spec.kind,
      confirmed_human: true,
      approved_by: approvedBy,
      approved_at: approvedAt,
    };
    const integrityValidation = validateIntegrityRecord(integrity, state.spec);
    if (!integrityValidation.ok) throw new StateMachineError(integrityValidation.issues.join('; '), { guard: 'approval-integrity', nextAction: 'Corrija o registro de aprovacao antes de escrever.' });
    const next = {
      ...state,
      spec: { ...state.spec, status: 'APPROVED', approved_by: approvedBy, approved_at: approvedAt },
      approval: { ...state.approval, spec: true, plan: true, tasks: true, architecture_decisions: true, integrity },
    };
    const nextValidation = validateState(next);
    if (!nextValidation.ok) throw new StateMachineError(nextValidation.errors.join(' '), { guard: 'state-invalid', nextAction: 'Corrija a transicao antes de escrever a aprovacao.' });
    writeJsonAtomic(path, next, { expectedRevision: state.revision });
    stdout.write(`spec aprovada: ${specId}\napproved_by: ${approvedBy}\ndigest: ${integrity.digest}\n`);
    return 0;
  } catch (error) {
    writeError(stderr, error);
    return error && typeof error === 'object' && /** @type {{ guard?: string }} */ (error).guard === 'usage' ? 2 : 1;
  }
}

/** @param {string[]} args */
function parseApproveArgs(args) {
  const [specId, ...flags] = args;
  if (!specId) {
    throw new StateMachineError('Uso: agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human.', { guard: 'usage', nextAction: 'Informe a identidade humana e confirme explicitamente.' });
  }
  assertSafeSpecId(specId);
  let approvedBy = null;
  let confirmedHuman = false;
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
    } else {
      throw new StateMachineError(`Uso: flag ou argumento desconhecido: ${flag}.`, { guard: 'usage', nextAction: 'Use apenas --approved-by e --confirm-human.' });
    }
  }
  if (approvedBy === null || !confirmedHuman) throw new StateMachineError('Uso: agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human.', { guard: 'usage', nextAction: 'Informe a identidade humana e confirme explicitamente.' });
  if (!isHumanApprover(approvedBy)) {
    throw new StateMachineError('approved-by deve identificar uma pessoa humana e nao pode ser vazio.', { guard: 'approved-by', nextAction: 'Informe a identidade humana que aprovou a spec.' });
  }
  return { specId, approvedBy: approvedBy.trim() };
}

/** @param {{ missing: string[], openMarkers: string[] }} artifacts @param {string[]} coherence */
function describeReadiness(artifacts, coherence) {
  const items = [];
  if (artifacts.missing.length) items.push(`crie: ${artifacts.missing.join(', ')}`);
  if (artifacts.openMarkers.length) items.push(`preencha marcadores em: ${artifacts.openMarkers.join(', ')}`);
  if (coherence.length) items.push(coherence.join('; '));
  return `Complete os artefatos antes de aprovar (${items.join(' | ')}).`;
}

/** @param {NodeJS.WritableStream} stderr @param {unknown} error */
function writeError(stderr, error) {
  const issue = error instanceof Error ? error.message : String(error);
  const meta = error && typeof error === 'object' ? /** @type {{ guard?: string, nextAction?: string }} */ (error) : {};
  stderr.write(`${issue}\nguard: ${meta.guard ?? 'runtime'}\nnextAction: ${meta.nextAction ?? 'Verifique os argumentos e tente novamente.'}\n`);
}
