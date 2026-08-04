/**
 * Handoff versionado de fechamento de sessao.
 *
 * O handoff e o unico artefato de continuidade textual entre sessoes: nao narra
 * o transcript, nao copia diff e nao carrega segredo. O SHA do proprio commit
 * de fechamento nunca aparece aqui — inserir o hash mudaria o conteudo e,
 * portanto, o proprio hash (PLAN secao 8).
 */
import { StateMachineError } from './state-machine.mjs';
import { assertTokenBudget } from './token-budget.mjs';

export const HANDOFF_TOKEN_BUDGET = 800;
const SHORT_SHA_LENGTH = 7;
const MAX_SLUG_LENGTH = 48;

/**
 * Deriva o slug curto do nome do arquivo da tarefa (`005-foo-bar.md` -> `foo-bar`).
 *
 * @param {string} taskFileName
 * @param {string} taskId
 */
export function deriveHandoffSlug(taskFileName, taskId) {
  const base = String(taskFileName).replace(/\.md$/i, '');
  const withoutId = base.startsWith(`${taskId}-`) ? base.slice(taskId.length + 1) : base;
  const slug = withoutId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  if (!slug) {
    throw new StateMachineError(`Nao foi possivel derivar slug do arquivo ${taskFileName}.`, {
      guard: 'handoff-name',
      nextAction: 'Renomeie o arquivo da tarefa para <id>-<slug>.md.',
    });
  }
  return slug;
}

/**
 * @param {{ taskId: string, taskFileName: string, deliverySha: string }} input
 */
export function buildHandoffFileName(input) {
  const slug = deriveHandoffSlug(input.taskFileName, input.taskId);
  const short = String(input.deliverySha).slice(0, SHORT_SHA_LENGTH);
  if (short.length !== SHORT_SHA_LENGTH) {
    throw new StateMachineError('SHA de entrega invalido para nomear o handoff.', {
      guard: 'handoff-name',
      nextAction: 'Confirme o commit de entrega antes de gerar o handoff.',
    });
  }
  return `${input.taskId}-${slug}-${short}.md`;
}

/**
 * @typedef {{
 *   taskId: string,
 *   title: string,
 *   writer: string,
 *   reviewers: string[],
 *   executionProfile: string,
 *   reviewsRequested: number,
 *   branch: string,
 *   fixedPoint: string,
 *   gates: string[],
 *   reviews: string[],
 *   aggregate: string | null,
 *   deliverySha: string,
 *   remoteRef: string,
 *   closedAt: string,
 *   limits: string[],
 *   nextTask: { id: string, status: string, writer: string } | null,
 *   externalChecks: string,
 * }} HandoffData
 */

/**
 * @param {HandoffData} data
 */
export function renderHandoff(data) {
  const reviewers = data.reviewers.length ? data.reviewers.join(', ') : '-';
  const gates = data.gates.length ? data.gates.join(', ') : '-';
  const reviews = data.reviews.length
    ? data.reviews.map((path) => `- \`${path}\``)
    : ['- nenhum obrigatorio'];
  const limits = data.limits.length ? data.limits.map((item) => `- ${item}`) : ['- nenhum'];
  const next = data.nextTask
    ? `- ${data.nextTask.id} ${data.nextTask.status}, writer ${data.nextTask.writer}, nao iniciada.`
    : '- nenhuma tarefa liberada.';

  const lines = [
    '---',
    `task_id: "${data.taskId}"`,
    `delivery_commit: ${data.deliverySha}`,
    `remote: ${data.remoteRef}`,
    `closed_at: ${data.closedAt}`,
    '---',
    '',
    `# Handoff ${data.taskId} — ${data.title}`,
    '',
    '## Tarefa',
    '',
    `- Writer: ${data.writer}`,
    `- Reviewers: ${reviewers}`,
    `- execution_profile: ${data.executionProfile}`,
    `- reviews_requested: ${data.reviewsRequested}`,
    `- Branch: ${data.branch}`,
    `- Fixed point: \`${data.fixedPoint}\``,
    '',
    '## Gates',
    '',
    `- ${gates} — PASS`,
    '',
    '## Reviews',
    '',
    ...reviews,
    `- Aggregate: ${data.aggregate ? `\`${data.aggregate}\`` : 'nao aplicavel'}`,
    '',
    '## Entrega',
    '',
    `- Delivery SHA: \`${data.deliverySha}\``,
    `- Remote confirmado: \`${data.remoteRef}\``,
    '- Commit de fechamento: derivado do Git apos existir; registrado fora deste',
    '  commit, sem autorreferencia.',
    '',
    '## Limites conhecidos',
    '',
    ...limits,
    '',
    '## Proxima tarefa',
    '',
    next,
    '',
    '## Checks externos',
    '',
    `- ${data.externalChecks}`,
    '',
    '## Retomada',
    '',
    '- Sem transcript e sem retomada de sessao anterior.',
    '- Recupere o contexto por Git, `state.json`, este handoff e o context-pack',
    '  gerado por `agentctl session start-next`.',
    '',
  ];

  return lines.join('\n');
}

/**
 * @param {string} content
 */
export function assertHandoffBudget(content) {
  return assertTokenBudget(content, HANDOFF_TOKEN_BUDGET, {
    label: 'handoff',
    guard: 'handoff-budget',
    nextAction: `Reduza o handoff para no maximo ${HANDOFF_TOKEN_BUDGET} tokens estimados.`,
  });
}
