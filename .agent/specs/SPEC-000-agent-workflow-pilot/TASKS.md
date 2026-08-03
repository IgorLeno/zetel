# Tarefas: SPEC-000

Status da decomposicao: `APPROVED` (extensoes `001A`/`001B` aprovadas pre-merge)

| ID | Titulo | Bloqueada por | Resultado vertical |
| --- | --- | --- | --- |
| 001 | Fundacao e state machine | — | Estado validavel, status legivel e guardas testadas |
| 001A | Endurecimento das invariantes e escrita concorrente | 001 | State machine e escrita atomica endurecidas; CodeRabbit resolvido |
| 001B | Fechamento das invariantes remanescentes | 001A | Saida BLOCKED, DONE/PUSHED, sessao/tarefa e fsync alinhados |
| 002 | Lifecycle de spec | 001B | Criar, aprovar e consultar spec com rastreabilidade |
| 002A | Correções pré-merge do lifecycle de spec | 002 | Endurecer parser, reapproval, integrity e readiness antes do merge |
| 002B | Fechamento documental pré-merge | 002A | Alinhar contratos documentais e encerrar threads válidos antes do merge |
| 003 | Lifecycle de tarefa e gates | 002B | Selecionar, iniciar, validar e fechar uma tarefa |
| 004 | Revisao independente em dois eixos | 003 | Reviews separados bloqueiam ou liberam fechamento |
| 005 | Handoff e nova sessao | 004 | Fechar sessao e iniciar processo novo com context-pack |
| 006 | Skills de intake, spec e planejamento | 005 | Primeira metade das skills funciona nos dois agentes |
| 007 | Skills de tarefa, revisao e sessao | 006 | Segunda metade das skills funciona nos dois agentes |
| 008 | Adaptadores curtos e perfil Zetel | 007 | Contexto inicial reduzido sem perder regras uteis |
| 009 | Convergencia, Harvest e avaliacao | 008 | Spec encerrada com metricas e recomendacao objetiva |

## Checkpoint

Historico (bootstrap, 2026-07-30): a tarefa 001 estava `READY`; as demais
`DRAFT` bloqueadas pela predecessora.

Checkpoint apos fechamento da 001B:

```text
001   SESSION_CLOSED
001A  SESSION_CLOSED
001B  SESSION_CLOSED
002   READY
active_task: null
session.status: SESSION_CLOSED
```

Historico: durante a 001B a 002 ficou `DRAFT` com `blocked_by: ["001B"]`
(excecao bootstrap aprovada).

Checkpoint apos fechamento da 002:

```text
001   SESSION_CLOSED
001A  SESSION_CLOSED
001B  SESSION_CLOSED
002   SESSION_CLOSED
003   READY
active_task: null
session.status: SESSION_CLOSED
```

Checkpoint durante a correcao pre-merge 002A:

```text
002   SESSION_CLOSED
002A  SESSION_CLOSED
003   READY, blocked_by: ["002A"]
active_task: null
session.status: SESSION_CLOSED
```

A tarefa 003 esta `READY` apos o fechamento da 002A, mas nao foi iniciada.

Checkpoint do delivery do fechamento documental pre-merge 002B:

```text
002A  SESSION_CLOSED
002B  DONE
003   DRAFT, blocked_by: ["002B"]
active_task: null
session.status: DONE
```

A tarefa 003 nao podia voltar a `READY` antes do fechamento versionado da 002B.

Checkpoint final apos fechamento da 002B:

```text
002A  SESSION_CLOSED
002B  SESSION_CLOSED
003   READY, blocked_by: ["002B"]
active_task: null
session.status: SESSION_CLOSED
```

A tarefa 003 foi somente liberada para `READY` e nao foi iniciada.

Regras:

- Cada tarefa usa processo novo, writer unico e no maximo dois revisores.
- Depois da 005, a proxima sessao deve ser iniciada por `agentctl session
  start-next`.
- Nenhuma tarefa pode absorver a seguinte por conveniencia.
- Correcao de review que exceda o escopo aprovado vira nova tarefa apos
  aprovacao.
- A criacao da 001A e a reencadeacao da 002 foram aprovadas explicitamente
  pelo prompt corretivo pre-merge.
