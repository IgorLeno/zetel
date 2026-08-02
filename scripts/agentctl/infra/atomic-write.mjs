import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { StateMachineError } from '../domain/state-machine.mjs';

/**
 * Escrita atomica preparada para mutacoes futuras de state.json.
 *
 * Contrato de durabilidade:
 * - Atomicidade logica: lock exclusivo + revisao + temp + rename.
 * - Durabilidade do conteudo: fsync do arquivo temporario antes do rename.
 * - Durabilidade da entrada do diretorio: tentativa best-effort apos o rename.
 *   Falha de fsync do diretorio nao reverte a escrita ja visivel e nao deve
 *   ser propagada como falsa falha da mutacao.
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

  if (data.revision !== options.expectedRevision) {
    throw new StateMachineError(
      'Guarda violada: data.revision deve coincidir com expectedRevision antes do incremento.',
      {
        guard: 'revision',
        nextAction: 'Envie o objeto com a revision atual; o writer incrementa.',
      },
    );
  }

  const dir = dirname(path);
  const lockPath = `${path}.lock`;
  let lockFd = null;

  try {
    try {
      lockFd = openSync(lockPath, 'wx');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') {
        throw new StateMachineError(
          `Guarda violada: lock de escrita ativo em ${lockPath}.`,
          {
            guard: 'write-lock',
            nextAction:
              'Aguarde outra escrita concluir. Se o lock for orfao, inspecione manualmente e remova apenas apos confirmar que nenhum processo escreve.',
          },
        );
      }
      throw error;
    }

    let exists = false;
    /** @type {unknown} */
    let currentRevision = undefined;

    try {
      const current = JSON.parse(readFileSync(path, 'utf8'));
      exists = true;
      currentRevision = current.revision;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        exists = false;
      } else if (error instanceof SyntaxError) {
        throw new StateMachineError(
          `Guarda violada: JSON corrompido em ${path}.`,
          {
            guard: 'state-corrupt',
            nextAction: 'Corrija ou restaure state.json a partir do Git antes de escrever.',
          },
        );
      } else {
        throw error;
      }
    }

    if (!exists) {
      if (options.expectedRevision > 0) {
        throw new StateMachineError(`Guarda violada: state ausente em ${path}.`, {
          guard: 'state-missing',
          nextAction:
            'Crie o state.json inicial com expectedRevision 0 via fluxo de create, ou corrija o caminho.',
        });
      }
    } else if (currentRevision !== options.expectedRevision) {
      throw new StateMachineError(
        `Guarda violada: revision esperada ${options.expectedRevision}, encontrada ${String(currentRevision)} (escrita concorrente).`,
        {
          guard: 'revision',
          nextAction: 'Religue o estado, reaplique a mutacao e tente novamente.',
        },
      );
    }

    const next = {
      ...data,
      revision: options.expectedRevision + 1,
    };

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
      // Rename ja tornou o conteudo visivel; nao propagar falha de fsync do dir.
      fsyncDirectoryBestEffort(dir);
    } catch (error) {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup
      }
      throw error;
    }

    return next;
  } finally {
    if (lockFd !== null) {
      try {
        closeSync(lockFd);
      } catch {
        // ignore
      }
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore cleanup
      }
    }
  }
}

/**
 * Tenta durabilizar a entrada do diretorio apos rename bem-sucedido.
 *
 * Limitacao registrada: se o fsync do diretorio falhar, a mutacao logica ja
 * persistiu via rename. Propagar o erro induziria o chamador a repetir uma
 * escrita ja concluida (risco de falsa falha / double-apply). Por isso a falha
 * e engolida de forma explicita — best-effort, nao parte do commit logico.
 *
 * @param {string} dir
 */
function fsyncDirectoryBestEffort(dir) {
  try {
    const fd = openSync(dir, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Best-effort: rename ja commitou a entrada nova no namespace do FS.
  }
}

function basenameSafe(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'state.json';
}
