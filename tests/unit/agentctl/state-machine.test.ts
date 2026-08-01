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
  it('permite caminho valido de tarefa', () => {
    expect(() => assertTransition('task', 'DRAFT', 'READY')).not.toThrow();
    expect(() => assertTransition('task', 'READY', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertTransition('task', 'IN_PROGRESS', 'VALIDATING')).not.toThrow();
    expect(() => assertTransition('task', 'VALIDATING', 'REVIEWING')).not.toThrow();
    expect(() => assertTransition('task', 'REVIEWING', 'DONE')).not.toThrow();
    expect(() => assertTransition('task', 'DONE', 'PUSHED')).not.toThrow();
    expect(() => assertTransition('task', 'PUSHED', 'SESSION_CLOSED')).not.toThrow();
  });

  it('recusa salto invalido', () => {
    expect(() => assertTransition('task', 'READY', 'DONE')).toThrow(/transicao invalida|guarda/i);
    expect(() => assertTransition('spec', 'DRAFT', 'APPROVED')).toThrow(/transicao invalida|guarda/i);
  });

  it('exige motivo e return_to em BLOCKED e so retorna ao destino registrado', () => {
    expect(() =>
      assertTransition('task', 'IN_PROGRESS', 'BLOCKED', {
        reason: 'gate falhou',
        return_to: 'IN_PROGRESS',
      }),
    ).not.toThrow();

    expect(() => assertTransition('task', 'IN_PROGRESS', 'BLOCKED')).toThrow(/motivo|return_to/i);

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

describe('active tasks e bloqueadores', () => {
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

  it('detecta tarefa bloqueada por dependencia', () => {
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

  it('rejeita BLOCKED com return_to invalido e active_task inconsistente', () => {
    const blocked = validateState(
      baseState({
        tasks: [
          {
            id: '001',
            status: 'BLOCKED',
            blocked_by: [],
            reason: 'falhou',
            return_to: 'NOT_A_STATUS',
          },
        ],
      }),
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some((i) => i.guard === 'blocked-return-to')).toBe(true);

    const inconsistent = validateState(
      baseState({
        active_task: '001',
        tasks: [{ id: '001', status: 'READY', blocked_by: [] }],
      }),
    );
    expect(inconsistent.ok).toBe(false);
    expect(inconsistent.issues.some((i) => i.guard === 'active-task')).toBe(true);
  });
});
