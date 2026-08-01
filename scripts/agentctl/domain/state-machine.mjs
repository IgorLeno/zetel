/**
 * Dominio puro da state machine do workflow Spec/Task/Session.
 * Sem I/O: validacao de schema, transicoes e bloqueadores.
 */

export const SPEC_STATUSES = Object.freeze([
  'DRAFT',
  'NEEDS_CLARIFICATION',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'VALIDATING',
  'REVIEWING',
  'BLOCKED',
  'DONE',
  'PUSHED',
  'SESSION_CLOSED',
]);

export const TASK_STATUSES = Object.freeze([
  'DRAFT',
  'READY',
  'IN_PROGRESS',
  'VALIDATING',
  'REVIEWING',
  'BLOCKED',
  'DONE',
  'PUSHED',
  'SESSION_CLOSED',
]);

export const SESSION_STATUSES = Object.freeze([
  'IN_PROGRESS',
  'VALIDATING',
  'REVIEWING',
  'BLOCKED',
  'DONE',
  'PUSHED',
  'SESSION_CLOSED',
]);

/** Statuses que contam como tarefa ativa (no maximo uma por vez). */
export const ACTIVE_TASK_STATUSES = Object.freeze([
  'IN_PROGRESS',
  'VALIDATING',
  'REVIEWING',
  'BLOCKED',
]);

/** Dependencias satisfeitas quando a predecessora chegou ao menos em DONE. */
const DEPENDENCY_SATISFIED = new Set(['DONE', 'PUSHED', 'SESSION_CLOSED']);

/** Metadados obrigatorios quando session.status === SESSION_CLOSED. */
const SESSION_CLOSED_REQUIRED_FIELDS = Object.freeze([
  'closed_at',
  'delivery_commit',
  'handoff',
]);

const TASK_TRANSITIONS = freezeEdges({
  DRAFT: ['READY'],
  READY: ['IN_PROGRESS', 'DRAFT'],
  IN_PROGRESS: ['VALIDATING', 'BLOCKED'],
  VALIDATING: ['REVIEWING', 'BLOCKED', 'IN_PROGRESS'],
  REVIEWING: ['DONE', 'BLOCKED', 'VALIDATING'],
  BLOCKED: [], // retorno controlado via return_to
  DONE: ['PUSHED'],
  PUSHED: ['SESSION_CLOSED'],
  SESSION_CLOSED: [],
});

const SPEC_TRANSITIONS = freezeEdges({
  DRAFT: ['NEEDS_CLARIFICATION', 'READY_FOR_APPROVAL'],
  NEEDS_CLARIFICATION: ['DRAFT', 'READY_FOR_APPROVAL'],
  READY_FOR_APPROVAL: ['APPROVED', 'NEEDS_CLARIFICATION', 'DRAFT'],
  APPROVED: ['VALIDATING', 'BLOCKED'],
  VALIDATING: ['REVIEWING', 'BLOCKED', 'APPROVED'],
  REVIEWING: ['DONE', 'BLOCKED', 'VALIDATING'],
  BLOCKED: [],
  DONE: ['PUSHED'],
  PUSHED: ['SESSION_CLOSED'],
  SESSION_CLOSED: [],
});

const SESSION_TRANSITIONS = freezeEdges({
  IN_PROGRESS: ['VALIDATING', 'BLOCKED'],
  VALIDATING: ['REVIEWING', 'BLOCKED', 'IN_PROGRESS'],
  REVIEWING: ['DONE', 'BLOCKED', 'VALIDATING'],
  BLOCKED: [],
  DONE: ['PUSHED'],
  PUSHED: ['SESSION_CLOSED'],
  SESSION_CLOSED: [],
});

const TRANSITIONS_BY_ENTITY = Object.freeze({
  task: TASK_TRANSITIONS,
  spec: SPEC_TRANSITIONS,
  session: SESSION_TRANSITIONS,
});

const STATUSES_BY_ENTITY = Object.freeze({
  task: new Set(TASK_STATUSES),
  spec: new Set(SPEC_STATUSES),
  session: new Set(SESSION_STATUSES),
});

function freezeEdges(map) {
  const out = {};
  for (const [from, tos] of Object.entries(map)) {
    out[from] = Object.freeze([...tos]);
  }
  return Object.freeze(out);
}

/**
 * Statuses a partir dos quais BLOCKED e alcancavel (candidatos validos a return_to).
 * @param {'task'|'spec'|'session'} entity
 */
export function statusesThatCanBlock(entity) {
  const edges = TRANSITIONS_BY_ENTITY[entity];
  if (!edges) return [];
  return Object.entries(edges)
    .filter(([, tos]) => tos.includes('BLOCKED'))
    .map(([from]) => from);
}

export class StateMachineError extends Error {
  /**
   * @param {string} message
   * @param {{ guard?: string, nextAction?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'StateMachineError';
    this.guard = meta.guard ?? 'state-machine';
    this.nextAction = meta.nextAction ?? 'Corrija o estado ou a transicao e tente novamente.';
  }
}

/**
 * @param {string} raw
 */
export function parseState(raw) {
  if (typeof raw !== 'string') {
    throw new StateMachineError('JSON malformado: entrada deve ser string.', {
      guard: 'schema',
      nextAction: 'Passe o conteudo textual de state.json.',
    });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateMachineError('JSON invalido ou malformado.', {
      guard: 'schema',
      nextAction: 'Corrija a sintaxe JSON de state.json.',
    });
  }
}

/**
 * @typedef {{ message: string, guard: string, nextAction: string }} ValidationIssue
 */

/**
 * @param {unknown} state
 * @returns {{ ok: boolean, errors: string[], issues: ValidationIssue[] }}
 */
export function validateState(state) {
  /** @type {ValidationIssue[]} */
  const issues = [];

  /**
   * @param {string} message
   * @param {string} guard
   * @param {string} nextAction
   */
  const push = (message, guard, nextAction) => {
    issues.push({ message, guard, nextAction });
  };

  if (!isPlainObject(state)) {
    push(
      'Estado malformado: raiz deve ser objeto.',
      'schema',
      'Forneca um objeto state.json valido.',
    );
    return { ok: false, errors: issues.map((i) => i.message), issues };
  }

  if (state.schema_version !== 1) {
    push('schema_version deve ser 1.', 'schema', 'Ajuste schema_version para 1.');
  }

  if (!Number.isInteger(state.revision) || state.revision < 1) {
    push('revision deve ser inteiro >= 1.', 'revision', 'Defina revision como inteiro >= 1.');
  }

  if (!isPlainObject(state.spec)) {
    push('spec ausente ou invalido.', 'schema', 'Inclua o objeto spec com id e status.');
  } else {
    if (typeof state.spec.id !== 'string' || state.spec.id.length === 0) {
      push('spec.id obrigatorio.', 'schema', 'Defina spec.id nao vazio.');
    }
    if (!SPEC_STATUSES.includes(state.spec.status)) {
      push(
        `spec.status invalido: ${String(state.spec.status)}.`,
        'status',
        `Use um status de spec valido: ${SPEC_STATUSES.join(', ')}.`,
      );
    }
    if (state.spec.status === 'BLOCKED') {
      pushBlockedFieldErrors(push, state.spec, 'spec', 'spec');
    }
  }

  /** @type {Map<string, { id: string, status: string, blocked_by?: string[] }>} */
  const tasksById = new Map();

  if (!Array.isArray(state.tasks)) {
    push('tasks deve ser array.', 'schema', 'Defina tasks como array de tarefas.');
  } else {
    const seen = new Set();
    for (const [index, task] of state.tasks.entries()) {
      if (!isPlainObject(task)) {
        push(`tasks[${index}] deve ser objeto.`, 'schema', 'Corrija o item de tasks para objeto.');
        continue;
      }
      if (typeof task.id !== 'string' || task.id.length === 0) {
        push(`tasks[${index}].id obrigatorio.`, 'schema', 'Defina id nao vazio para a tarefa.');
      } else if (seen.has(task.id)) {
        push(`tasks: id duplicado ${task.id}.`, 'schema', 'Remova ids duplicados em tasks.');
      } else {
        seen.add(task.id);
        tasksById.set(task.id, task);
      }
      if (!TASK_STATUSES.includes(task.status)) {
        push(
          `tasks[${index}].status invalido: ${String(task.status)}.`,
          'status',
          `Use um status de tarefa valido: ${TASK_STATUSES.join(', ')}.`,
        );
      }
      if (!Array.isArray(task.blocked_by) || task.blocked_by.some((id) => typeof id !== 'string')) {
        push(
          `tasks[${index}].blocked_by deve ser array de strings.`,
          'schema',
          'Defina blocked_by como array de ids string.',
        );
      } else {
        pushBlockedByIntegrityErrors(push, task, index, seen);
      }
      if (task.status === 'BLOCKED') {
        pushBlockedFieldErrors(push, task, `tasks[${index}]`, 'task');
      }
    }

    // Segunda passagem: referencias inexistentes e ciclos (ids ja coletados).
    for (const [index, task] of state.tasks.entries()) {
      if (!isPlainObject(task) || !Array.isArray(task.blocked_by)) continue;
      for (const depId of task.blocked_by) {
        if (typeof depId !== 'string') continue;
        if (!seen.has(depId)) {
          push(
            `tasks[${index}].blocked_by referencia id inexistente: ${depId}.`,
            'blocked-by',
            'Remova a dependencia ou crie a tarefa referenciada.',
          );
        }
      }
    }
    pushDependencyCycleErrors(push, state.tasks);

    const active = findActiveTasks(state);
    if (active.length > 1) {
      push(
        `Guarda violada: mais de uma tarefa ativa (${active.map((t) => t.id).join(', ')}).`,
        'active-task',
        `Mantenha apenas uma tarefa em ${ACTIVE_TASK_STATUSES.join('|')}.`,
      );
    } else if (active.length === 1) {
      if (state.active_task == null) {
        push(
          `Guarda violada: tarefa ativa ${active[0].id} com active_task null.`,
          'active-task',
          `Defina active_task como ${active[0].id}.`,
        );
      } else if (state.active_task !== active[0].id) {
        push(
          `Guarda violada: active_task=${state.active_task} diverge da tarefa ativa ${active[0].id}.`,
          'active-task',
          `Ajuste active_task para ${active[0].id}.`,
        );
      }
    } else if (state.active_task != null) {
      push(
        `Guarda violada: active_task=${state.active_task} sem tarefa em status ativo.`,
        'active-task',
        'Zere active_task ou mova a tarefa correspondente para um status ativo.',
      );
    }

    if (state.active_task != null && typeof state.active_task === 'string' && !seen.has(state.active_task)) {
      push(
        `active_task referencia id inexistente: ${state.active_task}.`,
        'active-task',
        'Aponte active_task para um id existente ou null.',
      );
    }
  }

  if (state.active_task != null && typeof state.active_task !== 'string') {
    push('active_task deve ser string ou null.', 'schema', 'Use string id ou null em active_task.');
  }

  if (!isPlainObject(state.session)) {
    push('session ausente ou invalido.', 'schema', 'Inclua o objeto session.');
  } else {
    // 1) Validar enum de status de forma independente.
    const sessionStatus = state.session.status;
    const hasSessionStatus = sessionStatus != null;
    let sessionStatusValid = false;

    if (hasSessionStatus) {
      if (!SESSION_STATUSES.includes(sessionStatus)) {
        push(
          `session.status invalido: ${String(sessionStatus)}.`,
          'status',
          `Use um status de sessao valido: ${SESSION_STATUSES.join(', ')}.`,
        );
      } else {
        sessionStatusValid = true;
      }
    }

    // 2) Se BLOCKED, validar reason/return_to independentemente do cruzamento.
    if (sessionStatusValid && sessionStatus === 'BLOCKED') {
      pushBlockedFieldErrors(push, state.session, 'session', 'session');
    }

    // 3) Invariantes cruzadas sessao/tarefa.
    if (sessionStatusValid) {
      pushSessionTaskInvariantErrors(push, state, tasksById);
    }
  }

  if (!isPlainObject(state.approval)) {
    push('approval ausente ou invalido.', 'schema', 'Inclua approval com booleans obrigatorios.');
  } else {
    for (const key of ['spec', 'plan', 'tasks', 'architecture_decisions']) {
      if (typeof state.approval[key] !== 'boolean') {
        push(
          `approval.${key} deve ser boolean.`,
          'schema',
          `Defina approval.${key} como true ou false.`,
        );
      }
    }
  }

  return {
    ok: issues.length === 0,
    errors: issues.map((issue) => issue.message),
    issues,
  };
}

/**
 * @param {'task'|'spec'|'session'} entity
 * @param {string} from
 * @param {string} to
 * @param {{ reason?: string, return_to?: string, task?: object, tasks?: object[] }} [context]
 */
export function assertTransition(entity, from, to, context = {}) {
  const allowedStatuses = STATUSES_BY_ENTITY[entity];
  if (!allowedStatuses) {
    throw new StateMachineError(`Entidade desconhecida: ${entity}.`, {
      guard: 'entity',
      nextAction: 'Use task, spec ou session.',
    });
  }

  if (!allowedStatuses.has(from) || !allowedStatuses.has(to)) {
    throw new StateMachineError(
      `Guarda violada: status desconhecido na transicao ${entity} ${from} -> ${to}.`,
      { guard: 'status', nextAction: 'Use apenas statuses do subconjunto da entidade.' },
    );
  }

  if (to === 'BLOCKED') {
    if (!context.reason || typeof context.reason !== 'string' || context.reason.trim() === '') {
      throw new StateMachineError(
        'Guarda violada: BLOCKED exige motivo (reason).',
        { guard: 'blocked-reason', nextAction: 'Informe reason e return_to ao bloquear.' },
      );
    }
    if (!context.return_to || typeof context.return_to !== 'string') {
      throw new StateMachineError(
        'Guarda violada: BLOCKED exige return_to valido.',
        { guard: 'blocked-return-to', nextAction: 'Informe return_to igual ao estado interrompido.' },
      );
    }
    if (context.return_to === 'BLOCKED') {
      throw new StateMachineError(
        'Guarda violada: return_to nao pode ser BLOCKED.',
        { guard: 'blocked-return-to', nextAction: 'Escolha o estado anterior ao bloqueio.' },
      );
    }
    // Retorno deve ser exatamente o estado interrompido (impede fuga para DONE/PUSHED/etc.).
    if (context.return_to !== from) {
      throw new StateMachineError(
        `Guarda violada: return_to deve ser o estado interrompido (${from}), nao ${context.return_to}.`,
        {
          guard: 'blocked-return-to',
          nextAction: `Ao entrar em BLOCKED a partir de ${from}, use return_to=${from}.`,
        },
      );
    }
    const edges = TRANSITIONS_BY_ENTITY[entity][from] ?? [];
    if (!edges.includes('BLOCKED')) {
      throw new StateMachineError(
        `Transicao invalida: ${entity} ${from} -> BLOCKED.`,
        {
          guard: 'transition',
          nextAction: 'BLOCKED so e alcancavel a partir de estados com aresta explicita para BLOCKED.',
        },
      );
    }
    return;
  }

  if (from === 'BLOCKED') {
    if (!context.return_to) {
      throw new StateMachineError(
        'Guarda violada: retorno de BLOCKED exige return_to registrado.',
        { guard: 'blocked-return-to', nextAction: 'Passe o return_to persistido no estado.' },
      );
    }
    if (to !== context.return_to) {
      throw new StateMachineError(
        `Guarda violada: retorno de BLOCKED so pode ir para o destino registrado (${context.return_to}), nao ${to}.`,
        {
          guard: 'blocked-return-to',
          nextAction: `Transicione para ${context.return_to} ou atualize return_to com aprovacao.`,
        },
      );
    }
    return;
  }

  const edges = TRANSITIONS_BY_ENTITY[entity][from] ?? [];
  if (!edges.includes(to)) {
    throw new StateMachineError(
      `Transicao invalida: ${entity} ${from} -> ${to}.`,
      {
        guard: 'transition',
        nextAction: edges.length
          ? `Destinos permitidos a partir de ${from}: ${edges.join(', ')}.`
          : `${from} e terminal neste subconjunto.`,
      },
    );
  }

  if (entity === 'task' && from === 'READY' && to === 'IN_PROGRESS') {
    const task = context.task;
    const tasks = context.tasks;
    if (!task || !Array.isArray(tasks)) {
      throw new StateMachineError(
        'Guarda violada: READY -> IN_PROGRESS exige context.task e context.tasks.',
        {
          guard: 'transition-context',
          nextAction: 'Execute a transicao usando o estado completo (task e tasks).',
        },
      );
    }
    if (typeof task.id !== 'string' || !tasks.some((item) => item && item.id === task.id)) {
      throw new StateMachineError(
        'Guarda violada: context.task deve existir em context.tasks.',
        {
          guard: 'transition-context',
          nextAction: 'Passe a tarefa que pertence ao array tasks do estado.',
        },
      );
    }
    if (isTaskBlockedByDependencies(task, tasks)) {
      throw new StateMachineError(
        `Guarda violada: tarefa ${task.id} bloqueada por dependencia.`,
        {
          guard: 'blocked-by',
          nextAction: `Conclua as tarefas em blocked_by (${(task.blocked_by ?? []).join(', ')}) antes de IN_PROGRESS.`,
        },
      );
    }
  }
}

/**
 * @param {{ tasks?: Array<{ id: string, status: string }> }} state
 */
export function findActiveTasks(state) {
  if (!Array.isArray(state?.tasks)) return [];
  return state.tasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status));
}

/**
 * @param {{ id: string, blocked_by?: string[] }} task
 * @param {Array<{ id: string, status: string }>} tasks
 */
export function isTaskBlockedByDependencies(task, tasks) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  for (const depId of task.blocked_by ?? []) {
    const dep = byId.get(depId);
    if (!dep || !DEPENDENCY_SATISFIED.has(dep.status)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {(message: string, guard: string, nextAction: string) => void} push
 * @param {Record<string, unknown>} entity
 * @param {string} label
 * @param {'task'|'spec'|'session'} entityKind
 */
function pushBlockedFieldErrors(push, entity, label, entityKind) {
  if (typeof entity.reason !== 'string' || entity.reason.trim() === '') {
    push(
      `${label}.reason obrigatorio quando status e BLOCKED.`,
      'blocked-reason',
      `Informe ${label}.reason com o motivo do bloqueio.`,
    );
  }
  if (typeof entity.return_to !== 'string' || entity.return_to.trim() === '') {
    push(
      `${label}.return_to obrigatorio quando status e BLOCKED.`,
      'blocked-return-to',
      `Informe ${label}.return_to com o status de retorno.`,
    );
    return;
  }
  if (entity.return_to === 'BLOCKED') {
    push(
      `${label}.return_to nao pode ser BLOCKED.`,
      'blocked-return-to',
      'Escolha o estado anterior ao bloqueio.',
    );
    return;
  }
  const allowedReturn = statusesThatCanBlock(entityKind);
  if (!allowedReturn.includes(entity.return_to)) {
    push(
      `${label}.return_to invalido: ${String(entity.return_to)}.`,
      'blocked-return-to',
      `return_to deve ser o estado interrompido (${allowedReturn.join(', ')}).`,
    );
  }
}

/**
 * @param {(message: string, guard: string, nextAction: string) => void} push
 * @param {{ id?: string, blocked_by: string[] }} task
 * @param {number} index
 * @param {Set<string>} seenIds
 */
function pushBlockedByIntegrityErrors(push, task, index, seenIds) {
  const deps = task.blocked_by;
  const localSeen = new Set();
  for (const depId of deps) {
    if (localSeen.has(depId)) {
      push(
        `tasks[${index}].blocked_by contem id duplicado: ${depId}.`,
        'blocked-by',
        'Remova ids duplicados em blocked_by.',
      );
    } else {
      localSeen.add(depId);
    }
    if (task.id && depId === task.id) {
      push(
        `tasks[${index}].blocked_by nao pode referenciar a propria tarefa.`,
        'blocked-by',
        'Remova a autorreferencia em blocked_by.',
      );
    }
  }
  // Referencias inexistentes: avaliadas apos coleta completa (seenIds pode estar incompleto aqui).
  void seenIds;
}

/**
 * Detecta ciclos simples no grafo blocked_by.
 * @param {(message: string, guard: string, nextAction: string) => void} push
 * @param {Array<{ id?: string, blocked_by?: string[] }>} tasks
 */
function pushDependencyCycleErrors(push, tasks) {
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !Array.isArray(task.blocked_by)) continue;
    graph.set(
      task.id,
      task.blocked_by.filter((id) => typeof id === 'string'),
    );
  }

  const visiting = new Set();
  const visited = new Set();

  /**
   * @param {string} node
   * @param {string[]} path
   */
  function dfs(node, path) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), node] : [...path, node];
      push(
        `Guarda violada: ciclo em blocked_by (${cycle.join(' -> ')}).`,
        'blocked-by',
        'Remova a dependencia ciclica entre tarefas.',
      );
      return;
    }
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      dfs(next, [...path, node]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const id of graph.keys()) {
    dfs(id, []);
  }
}

/**
 * @param {(message: string, guard: string, nextAction: string) => void} push
 * @param {Record<string, unknown>} state
 * @param {Map<string, { id: string, status: string }>} tasksById
 */
function pushSessionTaskInvariantErrors(push, state, tasksById) {
  const session = /** @type {Record<string, unknown>} */ (state.session);
  const status = session.status;
  const active = findActiveTasks(state);

  if (ACTIVE_TASK_STATUSES.includes(/** @type {string} */ (status))) {
    if (typeof session.task_id !== 'string' || session.task_id.length === 0) {
      push(
        'session.task_id obrigatorio quando a sessao esta ativa.',
        'session-task',
        'Defina session.task_id com o id da tarefa em andamento.',
      );
      return;
    }
    const task = tasksById.get(session.task_id);
    if (!task) {
      push(
        `session.task_id referencia id inexistente: ${session.task_id}.`,
        'session-task',
        'Aponte session.task_id para uma tarefa existente.',
      );
      return;
    }
    if (state.active_task !== session.task_id) {
      push(
        `Guarda violada: session.task_id=${session.task_id} diverge de active_task=${String(state.active_task)}.`,
        'session-task',
        'Mantenha session.task_id igual a active_task durante sessao ativa.',
      );
    }
    if (active.length === 0) {
      push(
        'Guarda violada: sessao ativa sem tarefa ativa.',
        'session-task',
        'Coloque a tarefa da sessao em IN_PROGRESS|VALIDATING|REVIEWING|BLOCKED.',
      );
    }
    if (task.status !== status) {
      push(
        `Guarda violada: session.status=${String(status)} incompativel com task.status=${task.status}.`,
        'session-task',
        'Mantenha session.status alinhado ao status da tarefa ativa.',
      );
    }
    return;
  }

  if (status === 'DONE' || status === 'PUSHED') {
    if (typeof session.task_id === 'string' && session.task_id.length > 0) {
      const task = tasksById.get(session.task_id);
      if (!task) {
        push(
          `session.task_id referencia id inexistente: ${session.task_id}.`,
          'session-task',
          'Aponte session.task_id para uma tarefa existente.',
        );
      } else if (task.status !== status) {
        push(
          `Guarda violada: session.status=${String(status)} incompativel com task.status=${task.status}.`,
          'session-task',
          'Mantenha session.status alinhado ao status da tarefa da sessao.',
        );
      }
    }
    if (active.length > 0) {
      push(
        `Guarda violada: session.status=${String(status)} com tarefa ainda ativa.`,
        'session-task',
        'Nao mantenha tarefa ativa apos DONE/PUSHED da sessao.',
      );
    }
    return;
  }

  if (status === 'SESSION_CLOSED') {
    if (active.length > 0) {
      push(
        `Guarda violada: SESSION_CLOSED com tarefa ainda ativa (${active.map((t) => t.id).join(', ')}).`,
        'session-closed',
        'Feche a tarefa ativa antes de SESSION_CLOSED.',
      );
    }
    if (state.active_task != null) {
      push(
        'Guarda violada: SESSION_CLOSED exige active_task null.',
        'session-closed',
        'Zere active_task ao fechar a sessao.',
      );
    }
    if (typeof session.task_id !== 'string' || session.task_id.length === 0) {
      push(
        'session.task_id obrigatorio quando session.status e SESSION_CLOSED.',
        'session-closed',
        'Registre a tarefa encerrada em session.task_id.',
      );
    } else {
      const closedTask = tasksById.get(session.task_id);
      if (!closedTask) {
        push(
          `session.task_id referencia id inexistente: ${session.task_id}.`,
          'session-closed',
          'Aponte session.task_id para a tarefa encerrada.',
        );
      } else if (closedTask.status !== 'SESSION_CLOSED') {
        push(
          `Guarda violada: session.task_id=${session.task_id} deve estar SESSION_CLOSED (atual: ${closedTask.status}).`,
          'session-closed',
          'Feche a tarefa indicada antes de marcar a sessao como SESSION_CLOSED.',
        );
      }
    }
    for (const field of SESSION_CLOSED_REQUIRED_FIELDS) {
      if (typeof session[field] !== 'string' || /** @type {string} */ (session[field]).trim() === '') {
        push(
          `session.${field} obrigatorio quando session.status e SESSION_CLOSED.`,
          'session-closed',
          `Preencha session.${field} no fechamento (confirmacao remota vem do Git, nao do SHA autorreferente).`,
        );
      }
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
