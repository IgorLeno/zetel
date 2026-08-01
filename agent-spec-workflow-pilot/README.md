# Agent Spec Workflow Pilot

Status do piloto: `TASK_001_CLOSED` · correcao `001A` em curso / checkpoint pre-merge.

Identificadores estaveis:

```text
repository: IgorLeno/zetel
remote: origin
branch: chore/spec-session-workflow-pilot
baseline: 5528881ea022c032fc17ba08a09d083787fdc839
```

Checkpoint atual (durante/apos 001A):

- `001` `SESSION_CLOSED`
- `001A` endurecimento pre-merge (fecha antes da 002)
- `002` bloqueada por `001A` durante a correcao; `READY` apos fechamento

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
