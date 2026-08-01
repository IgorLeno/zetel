import { describe, expect, it } from 'vitest';
import {
  ACTIVE_TASK_STATUSES,
  assertTransition,
  findActiveTasks,
  isTaskBlockedByDependencies,
  parseState,
  validateState,
} from '../../../scripts/agentctl/domain/state-machine.mjs';

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    revision: 1,
    spec: {
      id: 'SPEC-000-agent-workflow-pilot',
      status: 'APPROVED',
      approved_at: '2026-07-30T00:00:00-03:00',
      approved_by: 'human',
    },
    active_task: null,
    tasks: [
      { id: '001', status: 'READY', blocked_by: [] },
      { id: '002', status: 'DRAFT', blocked_by: ['001'] },
    ],
    session: {
      id: null,
      agent: null,
      task_id: null,
      status: null,
    },
    approval: {
      spec: true,
      plan: true,
      tasks: true,
      architecture_decisions: true,
    },
    ...overrides,
  };
}

function closedSessionState(overrides: Record<string, unknown> = {}) {
  return baseState({
    active_task: null,
    tasks: [
      { id: '001', status: 'SESSION_CLOSED', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
    ],
    session: {
      id: 'task-001',
      agent: 'cursor',
      task_id: '001',
      status: 'SESSION_CLOSED',
      closed_at: '2026-08-01T00:00:00-03:00',
      delivery_commit: 'abc123',
      handoff: '.agent/specs/SPEC-000-agent-workflow-pilot/handoffs/001.md',
    },
    ...overrides,
  });
}

describe('parseState / validateState', () => {
  it('aceita state.json bem formado no caminho valido', () => {
    const state = parseState(JSON.stringify(baseState()));
    const result = validateState(state);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejeita schema malformado', () => {
    expect(() => parseState('{')).toThrow(/JSON invalido|malformado/i);
    const result = validateState({ schema_version: 1 });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /revision|tasks|spec/i.test(e))).toBe(true);
  });

  it('rejeita status desconhecido', () => {
    const result = validateState(
      baseState({
        tasks: [{ id: '001', status: 'FLYING', blocked_by: [] }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/FLYING|status/i);
  });
});

describe('assertTransition', () => {
  it('permite caminho valido de tarefa com contexto completo', () => {
    const tasks = [
      { id: '001', status: 'READY', blocked_by: [] },
      { id: '002', status: 'DRAFT', blocked_by: ['001'] },
    ];
    expect(() => assertTransition('task', 'DRAFT', 'READY')).not.toThrow();
    expect(() =>
      assertTransition('task', 'READY', 'IN_PROGRESS', { task: tasks[0], tasks }),
    ).not.toThrow();
    expect(() => assertTransition('task', 'IN_PROGRESS', 'VALIDATING')).not.toThrow();
    expect(() => assertTransition('task', 'VALIDATING', 'REVIEWING')).not.toThrow();
    expect(() => assertTransition('task', 'REVIEWING', 'DONE')).not.toThrow();
    expect(() => assertTransition('task', 'DONE', 'PUSHED')).not.toThrow();
    expect(() => assertTransition('task', 'PUSHED', 'SESSION_CLOSED')).not.toThrow();
  });

  it('exige task e tasks em READY -> IN_PROGRESS', () => {
    expect(() => assertTransition('task', 'READY', 'IN_PROGRESS')).toThrow(
      /context\.task|transition-context|estado completo/i,
    );
    try {
      assertTransition('task', 'READY', 'IN_PROGRESS');
      expect.unreachable('deveria lancar');
    } catch (error: unknown) {
      expect(error).toMatchObject({ guard: 'transition-context' });
    }

    expect(() =>
      assertTransition('task', 'READY', 'IN_PROGRESS', {
        task: { id: 'ghost', status: 'READY', blocked_by: [] },
        tasks: [{ id: '001', status: 'READY', blocked_by: [] }],
      }),
    ).toThrow(/context\.task|transition-context/i);
  });

  it('recusa salto invalido', () => {
    expect(() => assertTransition('task', 'READY', 'DONE')).toThrow(/transicao invalida|guarda/i);
    expect(() => assertTransition('spec', 'DRAFT', 'APPROVED')).toThrow(/transicao invalida|guarda/i);
  });

  it('exige return_to igual ao estado interrompido e so retorna ao destino registrado', () => {
    expect(() =>
      assertTransition('task', 'IN_PROGRESS', 'BLOCKED', {
        reason: 'gate falhou',
        return_to: 'IN_PROGRESS',
      }),
    ).not.toThrow();

    expect(() => assertTransition('task', 'IN_PROGRESS', 'BLOCKED')).toThrow(/motivo|return_to/i);

    for (const bad of ['DONE', 'PUSHED', 'SESSION_CLOSED', 'DRAFT', 'READY']) {
      expect(() =>
        assertTransition('task', 'IN_PROGRESS', 'BLOCKED', {
          reason: 'fuga',
          return_to: bad,
        }),
      ).toThrow(/return_to|interrompido/i);
    }

    expect(() =>
      assertTransition('task', 'VALIDATING', 'BLOCKED', {
        reason: 'outro',
        return_to: 'REVIEWING',
      }),
    ).toThrow(/return_to|interrompido/i);

    expect(() =>
      assertTransition('task', 'BLOCKED', 'VALIDATING', {
        return_to: 'IN_PROGRESS',
      }),
    ).toThrow(/return_to|destino/i);

    expect(() =>
      assertTransition('task', 'BLOCKED', 'IN_PROGRESS', {
        return_to: 'IN_PROGRESS',
      }),
    ).not.toThrow();
  });
});

describe('active tasks, sessao e bloqueadores', () => {
  it('detecta duas tarefas ativas', () => {
    const state = baseState({
      tasks: [
        { id: '001', status: 'IN_PROGRESS', blocked_by: [] },
        { id: '002', status: 'VALIDATING', blocked_by: [] },
      ],
      active_task: '001',
    });
    const active = findActiveTasks(state);
    expect(active.map((t) => t.id).sort()).toEqual(['001', '002']);
    const result = validateState(state);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/duas tarefas|mais de uma|ativa/i);
  });

  it('considera statuses ativos coerentes', () => {
    expect(ACTIVE_TASK_STATUSES).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'VALIDATING', 'REVIEWING', 'BLOCKED']),
    );
  });

  it('detecta tarefa bloqueada por dependencia incompleta', () => {
    const tasks = [
      { id: '001', status: 'READY', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
    ];
    expect(isTaskBlockedByDependencies(tasks[1], tasks)).toBe(true);
    expect(isTaskBlockedByDependencies(tasks[0], tasks)).toBe(false);

    expect(() =>
      assertTransition('task', 'READY', 'IN_PROGRESS', {
        task: tasks[1],
        tasks,
      }),
    ).toThrow(/bloquead/i);
  });

  it('rejeita dependencia inexistente e autorreferencia', () => {
    const missing = validateState(
      baseState({
        tasks: [{ id: '001', status: 'READY', blocked_by: ['999'] }],
      }),
    );
    expect(missing.ok).toBe(false);
    expect(missing.issues.some((i) => i.guard === 'blocked-by')).toBe(true);
    expect(missing.errors.join(' ')).toMatch(/inexistente|999/i);

    const selfDep = validateState(
      baseState({
        tasks: [{ id: '001', status: 'READY', blocked_by: ['001'] }],
      }),
    );
    expect(selfDep.ok).toBe(false);
    expect(selfDep.errors.join(' ')).toMatch(/propria|autorrefer/i);
  });

  it('rejeita ciclo em blocked_by', () => {
    const cyclic = validateState(
      baseState({
        tasks: [
          { id: '001', status: 'DRAFT', blocked_by: ['002'] },
          { id: '002', status: 'DRAFT', blocked_by: ['001'] },
        ],
      }),
    );
    expect(cyclic.ok).toBe(false);
    expect(cyclic.errors.join(' ')).toMatch(/ciclo/i);
  });

  it('rejeita return_to terminal/persistido invalido e active_task inconsistente', () => {
    const blocked = validateState(
      baseState({
        active_task: '001',
        tasks: [
          {
            id: '001',
            status: 'BLOCKED',
            blocked_by: [],
            reason: 'falhou',
            return_to: 'DONE',
          },
        ],
        session: {
          id: 's1',
          agent: 'cursor',
          task_id: '001',
          status: 'BLOCKED',
          reason: 'falhou',
          return_to: 'DONE',
        },
      }),
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some((i) => i.guard === 'blocked-return-to')).toBe(true);

    const nullActive = validateState(
      baseState({
        active_task: null,
        tasks: [{ id: '001', status: 'IN_PROGRESS', blocked_by: [] }],
      }),
    );
    expect(nullActive.ok).toBe(false);
    expect(nullActive.issues.some((i) => i.guard === 'active-task')).toBe(true);

    const divergent = validateState(
      baseState({
        active_task: '002',
        tasks: [
          { id: '001', status: 'IN_PROGRESS', blocked_by: [] },
          { id: '002', status: 'READY', blocked_by: [] },
        ],
      }),
    );
    expect(divergent.ok).toBe(false);
    expect(divergent.issues.some((i) => i.guard === 'active-task')).toBe(true);
  });

  it('rejeita inconsistencias de sessao ativa e SESSION_CLOSED', () => {
    const missingTask = validateState(
      baseState({
        active_task: '001',
        tasks: [{ id: '001', status: 'IN_PROGRESS', blocked_by: [] }],
        session: {
          id: 's1',
          agent: 'cursor',
          task_id: '999',
          status: 'IN_PROGRESS',
        },
      }),
    );
    expect(missingTask.ok).toBe(false);
    expect(missingTask.errors.join(' ')).toMatch(/inexistente|999/i);

    const sessionWithoutActive = validateState(
      baseState({
        active_task: null,
        tasks: [{ id: '001', status: 'READY', blocked_by: [] }],
        session: {
          id: 's1',
          agent: 'cursor',
          task_id: '001',
          status: 'IN_PROGRESS',
        },
      }),
    );
    expect(sessionWithoutActive.ok).toBe(false);
    expect(sessionWithoutActive.errors.join(' ')).toMatch(/sessao ativa|active_task|incompativel/i);

    const incompatible = validateState(
      baseState({
        active_task: '001',
        tasks: [{ id: '001', status: 'IN_PROGRESS', blocked_by: [] }],
        session: {
          id: 's1',
          agent: 'cursor',
          task_id: '001',
          status: 'VALIDATING',
        },
      }),
    );
    expect(incompatible.ok).toBe(false);
    expect(incompatible.errors.join(' ')).toMatch(/incompativel/i);

    const closedWithActive = validateState(
      closedSessionState({
        active_task: '002',
        tasks: [
          { id: '001', status: 'SESSION_CLOSED', blocked_by: [] },
          { id: '002', status: 'IN_PROGRESS', blocked_by: ['001'] },
        ],
      }),
    );
    expect(closedWithActive.ok).toBe(false);
    expect(closedWithActive.errors.join(' ')).toMatch(/SESSION_CLOSED|ainda ativa/i);

    const closedOk = validateState(closedSessionState());
    expect(closedOk.ok).toBe(true);
  });

  it('valida session.status invalido mesmo com outros campos ausentes', () => {
    const result = validateState(
      baseState({
        session: {
          id: null,
          agent: null,
          task_id: null,
          status: 'NOT_A_STATUS',
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.guard === 'status')).toBe(true);
  });
});
