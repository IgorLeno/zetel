# Agent Spec Workflow Pilot

Status do piloto: `TASK_001A_CLOSED` · proxima unidade `002 READY`.

Identificadores estaveis:

```text
repository: IgorLeno/zetel
remote: origin
branch: chore/spec-session-workflow-pilot
baseline: 6f91b87476942d0bd6aa53295c283fdbfcdf6af5
```

Checkpoint atual:

- `001` `SESSION_CLOSED`
- `001A` `SESSION_CLOSED` (entrega `6f91b87`)
- `002` `READY`

`agentctl spec status` esta implementado. Demais comandos
(`spec create/approve`, lifecycle de tarefa, session, converge) continuam
pendentes.

Fontes de verdade:

- `.agent/specs/SPEC-000-agent-workflow-pilot/SPEC.md`
- `.agent/specs/SPEC-000-agent-workflow-pilot/PLAN.md`
- `.agent/specs/SPEC-000-agent-workflow-pilot/TASKS.md`
- `.agent/specs/SPEC-000-agent-workflow-pilot/state.json`

Os demais relatorios distinguem baseline `pre-task-001` de evidencias novas.
Nao transformar metricas antigas em metricas novas sem medicao.
