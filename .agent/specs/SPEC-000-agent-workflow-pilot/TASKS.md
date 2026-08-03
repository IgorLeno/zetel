# Tarefas: SPEC-000

Status da decomposicao: `APPROVED` (extensoes `001A`/`001B`, `002C` e
`003A` aprovadas pelo humano)

| ID | Titulo | Bloqueada por | Status |
| --- | --- | --- | --- |
| 001 | Fundacao e state machine | — | SESSION_CLOSED |
| 001A | Endurecimento das invariantes e escrita concorrente | 001 | SESSION_CLOSED |
| 001B | Fechamento das invariantes remanescentes | 001A | SESSION_CLOSED |
| 002 | Lifecycle de spec | 001B | SESSION_CLOSED |
| 002A | Correções pré-merge do lifecycle de spec | 002 | SESSION_CLOSED |
| 002B | Fechamento documental pré-merge | 002A | SESSION_CLOSED |
| 002C | Perfis adaptativos e redução de contexto | 002B | SESSION_CLOSED |
| 003 | Lifecycle de tarefa e gates | 002C | SESSION_CLOSED |
| 003A | Endurecimento pré-merge do lifecycle de tarefa | 003 | READY |
| 004 | Revisao independente em dois eixos | 003A | DRAFT |
| 005 | Handoff e nova sessao | 004 | DRAFT |
| 006 | Skills de intake, spec e planejamento | 005 | DRAFT |
| 007 | Skills de tarefa, revisao e sessao | 006 | DRAFT |
| 008 | Adaptadores curtos e perfil Zetel | 007 | DRAFT |
| 009 | Convergencia, Harvest e avaliacao | 008 | DRAFT |

Resultado vertical (referencia):
- 001: Estado validavel, status legivel e guardas testadas
- 001A: State machine e escrita atomica endurecidas; CodeRabbit resolvido
- 001B: Saida BLOCKED, DONE/PUSHED, sessao/tarefa e fsync alinhados
- 002: Criar, aprovar e consultar spec com rastreabilidade
- 002A: Endurecer parser, reapproval, integrity e readiness antes do merge
- 002B: Alinhar contratos documentais e encerrar threads validos antes do merge
- 002C: Aplicar FAST/STANDARD/FULL e encurtar adapters
- 003: Selecionar, iniciar, validar e fechar uma tarefa conforme o perfil
- 003A: Corrigir atomicidade, shell, timeout, reviews e integridade pre-merge
- 004: Reviews separados bloqueiam ou liberam fechamento
- 005: Fechar sessao e iniciar processo novo com context-pack
- 006: Primeira metade das skills funciona nos dois agentes
- 007: Segunda metade das skills funciona nos dois agentes
- 008: Contexto inicial reduzido sem perder regras uteis
- 009: Spec encerrada com metricas e recomendacao objetiva

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

Checkpoint durante a 002C:

```text
002B  SESSION_CLOSED
002C  IN_PROGRESS, blocked_by: ["002B"]
003   DRAFT, blocked_by: ["002C"]
active_task: "002C"
session.status: IN_PROGRESS
```

A insercao da 002C e o reencadeamento temporario da 003 sao excecao bootstrap
aprovada: os comandos de lifecycle que automatizarao o fluxo pertencem a 003.
O estado ainda passa por `assertTransition`, `validateState`,
`writeJsonAtomic` e `expectedRevision`.

Checkpoint final apos fechamento da 002C:

```text
002B  SESSION_CLOSED
002C  SESSION_CLOSED
003   READY, blocked_by: ["002C"]
active_task: null
session.status: SESSION_CLOSED
```

A tarefa 003 foi liberada, mas nao iniciada.

Checkpoint final da sessao 003 (perfil FULL):

```text
002C  SESSION_CLOSED
003   SESSION_CLOSED, blocked_by: ["002C"], execution_profile: FULL
004   READY, blocked_by: ["003"]
active_task: null
session.status: SESSION_CLOSED
session.task_id: "003"
```

Comandos entregues: `task next/start/validate/close`. Fechamento
PUSHED/SESSION_CLOSED e liberacao da 004 usaram bootstrap pos-push
(`session close` permanece na 005). A 004 nao foi iniciada.

Checkpoint de registro da 003A (bootstrap pre-merge autorizado):

```text
003   SESSION_CLOSED
003A  READY, blocked_by: ["003"]
004   DRAFT, blocked_by: ["003A"]
active_task: null
session.status: SESSION_CLOSED
```

A insercao da 003A e o reencadeamento da 004 sao excecao bootstrap aprovada
pelo prompt corretivo pre-merge. A 003 permanece SESSION_CLOSED e nao e
reaberta.

Regras:

- Cada tarefa usa processo novo, writer unico e no maximo dois revisores.
- Cada tarefa registra FAST, STANDARD ou FULL e justificativa; gates e reviews
  seguem `.agent/EXECUTION_PROFILES.md`.
- Depois da 005, a proxima sessao deve ser iniciada por `agentctl session
  start-next`.
- Nenhuma tarefa pode absorver a seguinte por conveniencia.
- Correcao de review que exceda o escopo aprovado vira nova tarefa apos
  aprovacao.
- A criacao da 001A e a reencadeacao da 002 foram aprovadas explicitamente
  pelo prompt corretivo pre-merge.
