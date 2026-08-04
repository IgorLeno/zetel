/**
 * Estimativa de tokens deterministica, offline e sem dependencias.
 *
 * Contrato publico (documentado em `.agent/COMMANDS.md`):
 * - normaliza CRLF/CR para LF e garante exatamente uma newline final;
 * - conta bytes UTF-8 do texto normalizado;
 * - estimativa = ceil(bytes / BYTES_PER_TOKEN).
 *
 * A divisao por 4 bytes e a aproximacao usual de BPE para texto latino. O valor
 * exato importa menos que a propriedade exigida pela SPEC: mesma entrada produz
 * sempre a mesma estimativa, em qualquer maquina, sem rede e sem tokenizer.
 */
import { StateMachineError } from './state-machine.mjs';

export const TOKEN_ESTIMATE_VERSION = 1;
export const BYTES_PER_TOKEN = 4;

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeForEstimate(text) {
  if (typeof text !== 'string') {
    throw new StateMachineError('Estimativa de tokens exige string.', {
      guard: 'token-budget',
      nextAction: 'Passe o conteudo textual ja renderizado antes de estimar tokens.',
    });
  }
  return `${text.replace(/\r\n?/g, '\n').replace(/\n*$/, '')}\n`;
}

/**
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  const normalized = normalizeForEstimate(text);
  const bytes = Buffer.byteLength(normalized, 'utf8');
  return Math.ceil(bytes / BYTES_PER_TOKEN);
}

/**
 * @param {string} text
 * @param {number} budget
 * @param {{ label: string, guard?: string, nextAction?: string }} meta
 * @returns {number} estimativa aceita
 */
export function assertTokenBudget(text, budget, meta) {
  const estimated = estimateTokens(text);
  if (estimated > budget) {
    throw new StateMachineError(
      `Orcamento de contexto excedido em ${meta.label}: ${estimated} tokens estimados > ${budget}.`,
      {
        guard: meta.guard ?? 'context-budget',
        nextAction: meta.nextAction
          ?? `Reduza ${meta.label} ate no maximo ${budget} tokens estimados.`,
      },
    );
  }
  return estimated;
}
