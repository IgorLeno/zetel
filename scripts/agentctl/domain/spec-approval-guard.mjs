import { dirname } from 'node:path';
import {
  aggregateDigest,
  checkTaskCoherence,
  collectApprovalArtifacts,
} from './spec-artifacts.mjs';
import { validateIntegrityRecord } from './spec-integrity.mjs';
import { StateMachineError } from './state-machine.mjs';

/**
 * Exige spec APPROVED com integrity intacta (contrato atual pos-002A).
 * @param {string} statePath
 * @param {any} state
 */
export function assertApprovedIntegrity(statePath, state) {
  if (state.spec?.status !== 'APPROVED') {
    throw new StateMachineError(`spec nao aprovada: ${String(state.spec?.status)}.`, {
      guard: 'spec-status',
      nextAction: 'Aprove a spec com ./agentctl spec approve antes de iniciar tarefas.',
    });
  }

  const hasIntegrity = Object.prototype.hasOwnProperty.call(state.approval ?? {}, 'integrity');
  if (!hasIntegrity) {
    throw new StateMachineError('spec aprovada sem envelope de integridade (LEGACY_UNVERIFIED).', {
      guard: 'spec-integrity',
      nextAction: 'Execute reaprovacao humana com --reapprove para registrar integrity.',
    });
  }

  const integrity = state.approval.integrity;
  const integrityValidation = validateIntegrityRecord(integrity, state.spec);
  if (!integrityValidation.ok) {
    throw new StateMachineError('approval.integrity malformada.', {
      guard: 'spec-tampered',
      nextAction: 'Restaure ou reaprove a spec com registro de integridade valido.',
    });
  }

  const specDir = dirname(statePath);
  const current = collectApprovalArtifacts(specDir);
  const coherence = checkTaskCoherence(specDir, state);
  const expected = new Map(integrity.manifest.map((entry) => [entry.path, entry.sha256]));
  const actual = new Map(current.manifest.map((entry) => [entry.path, entry.sha256]));
  /** @type {string[]} */
  const changed = [];
  for (const [artifactPath, digest] of expected) {
    if (!actual.has(artifactPath) || actual.get(artifactPath) !== digest) changed.push(artifactPath);
  }
  for (const artifactPath of actual.keys()) {
    if (!expected.has(artifactPath)) changed.push(artifactPath);
  }
  const currentDigest = aggregateDigest(current.manifest);
  const tampered = current.missing.length > 0
    || changed.length > 0
    || current.readinessIssues.length > 0
    || coherence.length > 0
    || current.openMarkers.length > 0
    || currentDigest !== integrity.digest;

  if (tampered) {
    throw new StateMachineError('spec adulterada em relacao ao manifest aprovado.', {
      guard: 'spec-tampered',
      nextAction: 'Restaure os artefatos aprovados ou solicite nova aprovacao humana.',
    });
  }
}
