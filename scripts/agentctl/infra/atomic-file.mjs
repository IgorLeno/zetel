import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { StateMachineError } from '../domain/state-machine.mjs';

/**
 * Escrita atomica de texto em arquivo arbitrario (temp exclusivo + fsync + rename).
 * Nao altera o contrato de revision de writeJsonAtomic.
 *
 * @param {string} targetPath
 * @param {string} content
 */
export function writeTextAtomic(targetPath, content) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new StateMachineError('Caminho de escrita atomica invalido.', {
      guard: 'evidence-write',
      nextAction: 'Informe um caminho absoluto ou relativo valido para a evidencia.',
    });
  }
  if (typeof content !== 'string') {
    throw new StateMachineError('Conteudo de escrita atomica deve ser string.', {
      guard: 'evidence-write',
      nextAction: 'Serialize o JSON completo antes de gravar a evidencia.',
    });
  }

  const dir = dirname(targetPath);
  const token = randomBytes(6).toString('hex');
  const tempPath = join(
    dir,
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.${token}.tmp`,
  );

  try {
    mkdirSync(dir, { recursive: true });
    // writeFileSync faz loop interno ate gravar todos os bytes (evita short write).
    // openSync wx garante exclusividade do temporario antes da escrita completa.
    const fd = openSync(tempPath, 'wx');
    closeSync(fd);
    writeFileSync(tempPath, content, 'utf8');
    const syncFd = openSync(tempPath, 'r+');
    try {
      fsyncSync(syncFd);
    } finally {
      closeSync(syncFd);
    }
    renameSync(tempPath, targetPath);
    fsyncDirectoryBestEffort(dir);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore cleanup
    }
    if (error instanceof StateMachineError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new StateMachineError(`Falha na escrita atomica de evidencia: ${detail}`, {
      guard: 'evidence-write',
      nextAction: 'Verifique permissoes/espaco em disco e reexecute task validate.',
    });
  }
}

/**
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
    // Best-effort: rename ja tornou o arquivo final visivel.
  }
}
