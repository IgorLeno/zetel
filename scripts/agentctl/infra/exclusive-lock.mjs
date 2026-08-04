import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { StateMachineError } from '../domain/state-machine.mjs';

/**
 * Lock exclusivo de operacao inteira (`openSync` com `wx`).
 *
 * Diferente do lock de `writeJsonAtomic`, que protege apenas uma escrita, este
 * lock cobre sequencias multi-arquivo — fechamento de sessao e autorizacao +
 * spawn do launcher — para que duas invocacoes concorrentes nao materializem
 * artefatos sobre o mesmo caminho nem lancem dois processos para a mesma tarefa.
 *
 * Lock orfao nao e removido automaticamente: a mensagem instrui inspecao manual,
 * seguindo o mesmo contrato ja adotado por `state.json.lock`.
 *
 * @template T
 * @param {string} lockPath
 * @param {{ guard: string, nextAction: string, owner?: string }} meta
 * @param {() => T} fn
 * @returns {T}
 */
export function withExclusiveLock(lockPath, meta, fn) {
  mkdirSync(dirname(lockPath), { recursive: true });
  /** @type {number | null} */
  let fd = null;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') {
      throw new StateMachineError(`Guarda violada: operacao ja em andamento (${lockPath}).`, {
        guard: meta.guard,
        nextAction: meta.nextAction,
      });
    }
    throw error;
  }

  try {
    try {
      writeFileSync(lockPath, `${meta.owner ?? String(process.pid)}\n`, 'utf8');
    } catch {
      // Conteudo do lock e diagnostico; a exclusividade vem do proprio open wx.
    }
    return fn();
  } finally {
    try {
      closeSync(fd);
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
