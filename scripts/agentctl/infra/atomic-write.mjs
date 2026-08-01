import { openSync, closeSync, fsyncSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StateMachineError } from '../domain/state-machine.mjs';

/**
 * Escrita atomica preparada para mutacoes futuras de state.json.
 * Usa arquivo temporario + rename e confere revision esperada.
 *
 * @param {string} path
 * @param {Record<string, unknown>} data
 * @param {{ expectedRevision: number }} options
 */
export function writeJsonAtomic(path, data, options) {
  if (!options || !Number.isInteger(options.expectedRevision)) {
    throw new StateMachineError('expectedRevision obrigatorio para escrita atomica.', {
      guard: 'revision',
      nextAction: 'Passe a revision lida antes da mutacao.',
    });
  }

  let currentRevision = null;
  try {
    const current = JSON.parse(readFileSync(path, 'utf8'));
    currentRevision = current.revision;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
      throw error;
    }
    if (options.expectedRevision > 0) {
      throw new StateMachineError(`Guarda violada: state ausente em ${path}.`, {
        guard: 'state-missing',
        nextAction: 'Crie o state.json inicial com revision 0 via fluxo de create, ou corrija o caminho.',
      });
    }
  }

  if (currentRevision !== null && currentRevision !== options.expectedRevision) {
    throw new StateMachineError(
      `Guarda violada: revision esperada ${options.expectedRevision}, encontrada ${currentRevision} (escrita concorrente).`,
      {
        guard: 'revision',
        nextAction: 'Religue o estado, reaplique a mutacao e tente novamente.',
      },
    );
  }

  if (data.revision !== options.expectedRevision) {
    throw new StateMachineError(
      'Guarda violada: data.revision deve coincidir com expectedRevision antes do incremento.',
      {
        guard: 'revision',
        nextAction: 'Envie o objeto com a revision atual; o writer incrementa.',
      },
    );
  }

  const next = {
    ...data,
    revision: options.expectedRevision + 1,
  };

  const dir = dirname(path);
  const tempPath = join(dir, `.${basenameSafe(path)}.${process.pid}.${Date.now()}.tmp`);
  const payload = `${JSON.stringify(next, null, 2)}\n`;

  try {
    writeFileSync(tempPath, payload, 'utf8');
    const fd = openSync(tempPath, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, path);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore cleanup
    }
    throw error;
  }

  return next;
}

function basenameSafe(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'state.json';
}
