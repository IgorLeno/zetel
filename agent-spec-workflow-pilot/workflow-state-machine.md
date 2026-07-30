# Workflow state machine

Sequencia de estados suportada:

```text
DRAFT
-> NEEDS_CLARIFICATION
-> READY_FOR_APPROVAL
-> APPROVED
-> READY
-> IN_PROGRESS
-> VALIDATING
-> REVIEWING
-> BLOCKED
-> DONE
-> PUSHED
-> SESSION_CLOSED
```

Spec, tarefa e sessao usam subconjuntos coerentes. `BLOCKED` exige motivo e
estado de retorno; nao e um passo obrigatorio do caminho feliz.

Guardas essenciais:

- tarefa bloqueada nao inicia;
- somente uma tarefa pode estar ativa;
- `DONE` exige gates e reviews aplicaveis;
- `PUSHED` exige SHA de entrega no remote;
- `SESSION_CLOSED` exige handoff versionado, commit de fechamento remoto e
  arvore limpa.

Estado do bootstrap: spec aprovada, tarefa 001 `READY`, nenhuma tarefa ativa.
A implementacao e os testes destas guardas pertencem as tarefas 001 a 005.
