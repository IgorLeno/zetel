import { aggregateDigest, comparePortablePaths } from './spec-artifacts.mjs';

export const HASH_ALGORITHM = 'SHA-256';
export const HASH_FORMAT_VERSION = 1;

/** @param {unknown} value */
export function isHumanApprover(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^(bot|agent)$/i.test(value.trim());
}

/** @param {unknown} value */
function isUtcIsoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/** @param {unknown} entry */
function isManifestEntry(entry) {
  return (
    entry && typeof entry === 'object' && !Array.isArray(entry) &&
    Object.keys(entry).length === 2 &&
    typeof entry.path === 'string' &&
    entry.path.length > 0 &&
    !entry.path.startsWith('/') &&
    !entry.path.includes('\\') &&
    !entry.path.split('/').includes('..') &&
    typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256)
  );
}

/** @param {unknown} integrity @param {{ kind: unknown }} stateSpec */
export function validateIntegrityRecord(integrity, stateSpec) {
  /** @type {string[]} */
  const issues = [];
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) {
    return { ok: false, issues: ['approval.integrity ausente ou invalido'] };
  }
  if (integrity.algorithm !== HASH_ALGORITHM) issues.push('algoritmo de hash nao suportado');
  if (integrity.format_version !== HASH_FORMAT_VERSION) issues.push('versao do formato de hash nao suportada');
  if (integrity.kind !== stateSpec.kind || !['mini', 'full'].includes(integrity.kind)) issues.push('kind da approval diverge da spec');
  if (integrity.confirmed_human !== true) issues.push('confirmacao humana explicita ausente');
  if (!isHumanApprover(integrity.approved_by)) issues.push('approved_by nao identifica uma pessoa humana');
  if (!isUtcIsoTimestamp(integrity.approved_at)) issues.push('approved_at nao e timestamp UTC ISO-8601 valido');
  if (!Array.isArray(integrity.manifest) || integrity.manifest.length === 0) {
    issues.push('manifest ausente ou vazio');
  } else {
    for (const entry of integrity.manifest) if (!isManifestEntry(entry)) issues.push('entrada de manifest invalida');
    for (let index = 1; index < integrity.manifest.length; index += 1) {
      if (
        isManifestEntry(integrity.manifest[index - 1]) &&
        isManifestEntry(integrity.manifest[index]) &&
        comparePortablePaths(integrity.manifest[index - 1].path, integrity.manifest[index].path) >= 0
      ) {
        issues.push('manifest nao esta estritamente ordenado ou possui path duplicado');
        break;
      }
    }
    if (typeof integrity.digest !== 'string' || !/^[a-f0-9]{64}$/.test(integrity.digest)) {
      issues.push('digest invalido');
    } else if (integrity.digest !== aggregateDigest(integrity.manifest)) {
      issues.push('digest nao confere com o manifest registrado');
    }
  }
  return { ok: issues.length === 0, issues };
}
