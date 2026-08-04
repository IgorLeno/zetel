/**
 * Fronteira entre processos: monta o argv do agente da proxima sessao.
 *
 * O launcher nunca retoma conversa. Qualquer indicio de retomada no argv
 * (bandeira, subcomando, identificador de sessao anterior ou transcript) e
 * rejeitado antes do spawn.
 */
import { StateMachineError } from './state-machine.mjs';

export const SUPPORTED_AGENTS = Object.freeze(['codex', 'claude']);

/** Substrings proibidas em qualquer posicao do argv, em qualquer caixa. */
export const FORBIDDEN_ARGV_TOKENS = Object.freeze([
  'resume',
  'continue',
  'fork-session',
  'fork_session',
  'transcript',
]);

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{3,127}$/;

/**
 * @param {string[]} argv
 */
export function assertNoResumptionArgv(argv) {
  for (const part of argv) {
    const lower = String(part).toLowerCase();
    for (const token of FORBIDDEN_ARGV_TOKENS) {
      if (lower.includes(token)) {
        throw new StateMachineError(
          `argv de lancamento contem token de retomada proibido: ${token}.`,
          {
            guard: 'forbidden-argv',
            nextAction: 'Lance sempre um processo novo, sem retomada, bandeira de sessao ou transcript.',
          },
        );
      }
    }
  }
  return argv;
}

/**
 * Prompt de uma linha, sem metacaracteres de shell e sem token de retomada.
 *
 * @param {{ specId: string, taskId: string, packRelDir: string, agent: string }} input
 */
export function buildLaunchPrompt(input) {
  const prompt = [
    'Sessao nova e isolada.',
    `Leia ${input.packRelDir}/INSTRUCTIONS.md e ${input.packRelDir}/MANIFEST.json antes de agir.`,
    `Recupere o contexto somente por esse context-pack, pelo Git e por state.json.`,
    `Confirme Git e estado, entao execute exatamente a tarefa ${input.taskId} da spec ${input.specId}.`,
    `Inicie por ./agentctl task start ${input.specId} ${input.taskId} --agent ${input.agent}.`,
    'Nao reabra a tarefa anterior, nao inicie uma segunda tarefa e pare apos o fechamento da sessao.',
  ].join(' ');
  assertNoResumptionArgv([prompt]);
  return prompt;
}

/**
 * @param {{ agent: string, root: string, prompt: string }} input
 * @returns {string[]}
 */
export function buildLaunchArgv(input) {
  if (!SUPPORTED_AGENTS.includes(input.agent)) {
    throw new StateMachineError(`Agente sem launcher suportado: ${input.agent}.`, {
      guard: 'agent-unsupported',
      nextAction: `Use --agent ${SUPPORTED_AGENTS.join(' ou ')}.`,
    });
  }
  const argv = input.agent === 'codex'
    ? ['codex', '-C', input.root, input.prompt]
    : ['claude', input.prompt];
  return assertNoResumptionArgv(argv);
}

/**
 * Aceita somente identificadores fornecidos pela CLI lancada. A ausencia nao e
 * falha: nenhuma CLI suportada documenta session ID obrigatorio hoje.
 *
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeSessionId(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  return SESSION_ID.test(value) ? value : null;
}
