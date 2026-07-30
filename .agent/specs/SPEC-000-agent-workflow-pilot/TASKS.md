# Tarefas: SPEC-000

Status da decomposicao: `APPROVED`

| ID | Titulo | Bloqueada por | Resultado vertical |
| --- | --- | --- | --- |
| 001 | Fundacao e state machine | — | Estado validavel, status legivel e guardas testadas |
| 002 | Lifecycle de spec | 001 | Criar, aprovar e consultar spec com rastreabilidade |
| 003 | Lifecycle de tarefa e gates | 002 | Selecionar, iniciar, validar e fechar uma tarefa |
| 004 | Revisao independente em dois eixos | 003 | Reviews separados bloqueiam ou liberam fechamento |
| 005 | Handoff e nova sessao | 004 | Fechar sessao e iniciar processo novo com context-pack |
| 006 | Skills de intake, spec e planejamento | 005 | Primeira metade das skills funciona nos dois agentes |
| 007 | Skills de tarefa, revisao e sessao | 006 | Segunda metade das skills funciona nos dois agentes |
| 008 | Adaptadores curtos e perfil Zetel | 007 | Contexto inicial reduzido sem perder regras uteis |
| 009 | Convergencia, Harvest e avaliacao | 008 | Spec encerrada com metricas e recomendacao objetiva |

Regras:

- A tarefa 001 passa a `READY`; as demais permanecem `DRAFT` e bloqueadas pela
  predecessora.
- Cada tarefa usa processo novo, writer unico e no maximo dois revisores.
- Depois da 005, a proxima sessao deve ser iniciada por `agentctl session
  start-next`.
- Nenhuma tarefa pode absorver a seguinte por conveniencia.
- Correcao de review que exceda o escopo aprovado vira nova tarefa apos
  aprovacao.
