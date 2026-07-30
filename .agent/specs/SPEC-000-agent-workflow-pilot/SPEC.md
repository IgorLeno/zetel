# SPEC-000: Agent Workflow Pilot

## Identificador

`SPEC-000-agent-workflow-pilot`

## Titulo

Piloto do workflow Spec -> Task -> Commit -> Push -> Nova Sessao no Zetel

## Status

`APPROVED`

## Problema

O Zetel possui regras de projeto extensas e duplicadas entre `AGENTS.md` e
`CLAUDE.md`, planos historicos dispersos e nenhum mecanismo executavel que
garanta uma tarefa por sessao, gates antes de commit/push, revisao em dois
eixos, handoff curto ou retomada apenas pelo Git.

Sem um contrato compartilhado, Codex e Claude Code podem carregar contexto
demais, aplicar workflows diferentes e iniciar a proxima tarefa antes de fechar
a atual.

## Resultado esperado

Um workflow local, versionado e portavel que:

1. transforma toda solicitacao em mini-spec ou spec completa;
2. exige aprovacao humana da spec, do plano e da decomposicao;
3. executa exatamente uma tarefa vertical por sessao;
4. bloqueia transicoes invalidas;
5. exige gates e duas revisoes independentes antes do fechamento;
6. confirma commit, push, remote sincronizado e arvore limpa antes de encerrar;
7. inicia Codex ou Claude Code em processo novo, sem `resume`;
8. permite ao outro agente retomar apenas pelo Git, handoff e context-pack;
9. encerra a spec com convergencia e Knowledge Harvest controlado.

## Usuarios ou atores

- Humano aprovador: decide spec, tarefas, arquitetura, escopo e waivers.
- Agente escritor: exatamente um por tarefa.
- Revisor de conformidade: compara o diff com a spec.
- Revisor de qualidade: avalia engenharia independentemente da conformidade.
- `agentctl`: aplica validacoes deterministicas e registra evidencias.

## Requisitos

### R1. Classificacao e spec

- Toda alteracao deve ter spec.
- Mudanca pequena pode usar mini-spec.
- Qualquer fator de grande porte definido na solicitacao exige spec completa.
- Specs de criacao e execucao devem ser acionadas explicitamente.

### R2. Aprovacao

- `spec approve` deve exigir confirmacao humana registrada.
- A aprovacao abrange `SPEC.md`, `PLAN.md`, `TASKS.md` e arquivos de tarefa.
- Alteracao de escopo, decisao nova, waiver ou criterio nao automatizavel deve
  retornar a aprovacao humana.

### R3. Tarefas verticais

- Cada tarefa entrega resultado completo e verificavel.
- Cada tarefa cabe em uma sessao, declara bloqueadores e termina com projeto
  verde.
- Uma sessao nao pode iniciar ou concluir duas tarefas.
- Tarefa bloqueada nao pode ir para `IN_PROGRESS`.

### R4. State machine

O sistema deve suportar e validar:

`DRAFT -> NEEDS_CLARIFICATION -> READY_FOR_APPROVAL -> APPROVED -> READY ->
IN_PROGRESS -> VALIDATING -> REVIEWING -> BLOCKED -> DONE -> PUSHED ->
SESSION_CLOSED`

As entidades usam subconjuntos coerentes dessa sequencia. `BLOCKED` registra o
estado de retorno e o motivo. Nao deve haver alteracao direta do JSON que seja
aceita como transicao valida sem passar pelo validador.

### R5. Gates

- Testes focados devem preceder gates amplos.
- Gates padrao: `pnpm build`, `pnpm test:ci`, `pnpm test:coverage`,
  `pnpm typecheck` e `git diff --check`.
- E2E live nao pode executar sem variavel, chave e autorizacao adequadas.
- `DONE` exige evidencias recentes dos gates aplicaveis.

### R6. Revisao

- Revisoes de spec compliance e engineering quality geram relatorios
  separados.
- Revisores nao recebem o relatorio um do outro antes de concluir.
- Achado bloqueante em qualquer eixo impede `DONE`, commit e push.
- O escritor nao pode ser o unico revisor.

### R7. Git

- O piloto usa `chore/spec-session-workflow-pilot`.
- Nao cria PR e nao faz merge em `main`.
- Spec aprovada e cada tarefa concluida recebem commit e push proprios.
- O fechamento versionado usa um commit de entrega e, quando o handoff precisa
  referenciar esse SHA, um commit pequeno de fechamento. O segundo commit pode
  conter apenas `state.json`, handoff e metricas da sessao.
- Force push, reescrita remota e exclusao de branch remota sao proibidos.
- Alteracoes preexistentes do usuario nao podem ser sobrescritas ou incluidas
  sem relacao com a tarefa.

### R8. Fechamento de sessao

- Depois do push do commit de entrega: confirmar o SHA remoto, criar o handoff
  que referencia esse commit, atualizar o estado e produzir o commit de
  fechamento.
- `SESSION_CLOSED` exige que o commit de fechamento tambem esteja no remote e
  que a arvore esteja limpa.
- O handoff segue o formato definido nesta spec e nao narra o transcript.
- A sessao termina sem executar a proxima tarefa.

### R9. Nova sessao

`agentctl session start-next --agent <codex|claude>` deve:

1. confirmar remote sincronizado;
2. confirmar working tree limpo;
3. selecionar a proxima tarefa desbloqueada;
4. gerar context-pack minimo;
5. iniciar processo novo sem `resume`, `continue` ou transcript anterior;
6. registrar session ID quando a CLI o fornecer.

O comando nao deve ser chamado por um agente ainda ativo antes do fechamento.
Um modo de diagnostico deve validar tudo sem iniciar processo.

### R10. Skills compartilhadas

Devem existir as 14 skills solicitadas, com fonte canonica unica e adaptadores
portaveis para Codex e Claude Code. Cada skill declara ativacao, inputs, outputs,
tools, permissoes, efeitos colaterais, limite de contexto, parada, fallback e
quando nao usar.

Nenhuma skill executa automaticamente duas tarefas. Skills de spec e execucao
sao explicitas. Gates podem ser acionados automaticamente por comandos de
validacao.

### R11. Adaptadores curtos

- `AGENTS.md` deve ter no maximo 150 linhas.
- `CLAUDE.md` deve ter no maximo 100 linhas.
- Regras invariantes ficam nos adaptadores.
- Estado, arquitetura, historico, decisoes, gates, specs e dividas ficam em
  artefatos proprios, sem perda de informacao util.

### R12. Context-pack

Cada sessao recebe somente as instrucoes reduzidas, contexto do projeto, resumo
da spec, tarefa ativa, criterios, ADRs relacionados, handoff anterior, comandos
de teste e estado Git.

Nao carrega automaticamente transcript, tarefas concluidas, specs encerradas,
todos os ADRs, todas as skills ou MCPs irrelevantes.

### R13. Perfil Zetel

Conhecimento especifico de Next.js, React, TypeScript, Vitest, Playwright,
SQLite local-first, seguranca Markdown/HTML, OpenRouter e testes live fica em
skills/regras de projeto, nao no escopo global.

### R14. Convergencia e Harvest

`spec converge` verifica criterios, tarefas, reviews, gates, docs, rollback e
pendencias. Knowledge Harvest extrai candidatos para inbox, classifica,
deduplica, valida evidencias e propoe promocao. Nenhuma promocao ocorre sem
aprovacao ou gate explicitamente aprovado.

### R15. Metricas

O piloto deve registrar estimativas reproduziveis de contexto, arquivos
carregados, skills anunciadas/invocadas, tool calls, duracao, releituras,
erros de contexto, handoff, troca de agente, idempotencia, gates e correcoes.

## Criterios de aceitacao

- [ ] Spec completa criada, aprovada, commitada e enviada.
- [ ] Decomposicao vertical aprovada, com bloqueadores explicitos.
- [ ] `agentctl` oferece todos os comandos solicitados.
- [ ] Transicoes invalidas e tarefa bloqueada falham com mensagem acionavel.
- [ ] `DONE` falha sem gates e `SESSION_CLOSED` falha sem push confirmado.
- [ ] Duas revisoes separadas bloqueiam fechamento quando necessario.
- [ ] Pelo menos tres tarefas sao executadas em processos novos.
- [ ] Nenhuma sessao executa duas tarefas.
- [ ] Pelo menos uma retomada Codex -> Claude e uma Claude -> Codex sao
  exercitadas, quando ambas as CLIs estiverem operacionais.
- [ ] O segundo agente retoma apenas por Git, handoff e context-pack.
- [ ] `AGENTS.md`, `CLAUDE.md`, resumo, tarefa e handoff respeitam os budgets.
- [ ] Contexto inicial e substancialmente menor que o baseline documentado.
- [ ] Gates do Zetel passam, sem E2E live nao autorizado.
- [ ] Nenhum comportamento funcional do produto e alterado.
- [ ] Rollback e recomendacao de skills sao documentados.
- [ ] Relatorios solicitados sao preenchidos com evidencias, nao estimativas
  apresentadas como fatos.

## Requisitos nao funcionais

- Sem dependencias novas para o wrapper.
- Scripts deterministas, idempotentes e testaveis offline.
- JSON escrito atomicamente para evitar estado parcial.
- Caminhos relativos ao root Git; nenhum caminho com nome de usuario.
- Nenhum segredo, transcript ou conteudo pessoal em artefatos.
- Saidas de erro devem indicar guarda violada e proxima acao.
- Context budgets: resumo <= 800 tokens estimados, tarefa <= 1.500, handoff <=
  800, no maximo 3 skills completas por sessao.

## Decisoes de produto

- O Git versionado e a fonte de continuidade entre sessoes.
- O writer e unico; revisores podem ser no maximo dois.
- Branch/worktree sao escolhas de risco, nao obrigacoes universais.
- O runtime completo do Spec Kit e pacotes completos de terceiros nao serao
  instalados.
- Skills externas serao referencias ou adaptacoes com proveniencia, nunca
  importadas em massa.
- `start-next` e comando de fronteira operado depois do encerramento, nao um
  loop autonomo dentro da sessao atual.
- Handoff e estado de fechamento nao tentam conter o proprio SHA. Eles
  referenciam o commit de entrega e sao versionados no commit de fechamento,
  evitando uma autorreferencia impossivel no Git.

## Fora de escopo

- Migrar Caderneta, Grimperium ou qualquer outro repositorio.
- Alterar comportamento funcional, schema ou dados do Zetel.
- Merge em `main`, criacao de PR, deploy ou release.
- Instalar Spec Kit, Superpowers, Matt Pocock Skills ou Vercel Skills.
- Criar politica global `agent-policy`.
- Executar benchmark caro, E2E live ou chamadas OpenRouter.

## Riscos

| Risco | Mitigacao |
| --- | --- |
| Estado JSON divergir dos documentos | Validador cruza state, tarefas e Git |
| Handoff/estado deixarem a arvore suja | Handoff e estado entram no commit da tarefa antes do push |
| `start-next` iniciar outra sessao cedo | Guarda de `SESSION_CLOSED` e operacao humana |
| Adaptadores duplicarem conteudo | Fonte canonica e adaptadores gerados/validados |
| Hooks causarem escrita oculta | Sem hooks mutantes no piloto; comandos explicitos |
| Gates amplos consumirem tempo | Focados primeiro; amplo antes de commit |
| Claude indisponivel/autenticacao | Registrar bloqueio; nao simular comparacao |
| Metricas de token imprecisas | Declarar metodo e separar contagem de estimativa |

## Questoes abertas

Estas propostas foram aprovadas junto com a spec:

1. Implementar `agentctl` em Node.js ESM usando somente bibliotecas nativas.
2. Usar `.agents/skills/` como fonte canonica e adaptadores Claude por symlinks
   relativos, com fallback documentado para adaptadores gerados.
3. Manter estado operacional efemero fora do indice Git e estado de spec/tarefa
   versionado em `state.json`.
4. Tratar falha de autenticacao de um agente como limitacao do piloto, sem
   substituir evidencia real por simulacao.

## Estrategia de testes

- Unitarios do parser, transicoes, bloqueadores, budgets e selecao da tarefa.
- Integracao em repositorio Git temporario para commit/push com remote bare.
- Testes de processo com executaveis fake para provar ausencia de `resume`.
- Testes de falha para arvore suja, remote atrasado, gates ausentes e review
  bloqueante.
- Smoke real das CLIs apenas em modo diagnostico/controlado.
- Gates completos do Zetel antes de cada commit de tarefa.

## Dependencias

- Node.js ja usado pelo projeto.
- Git e remote `origin`.
- CLIs instaladas: Codex `0.145.0`; Claude Code `2.1.207`.
- `pnpm` e dependencias atuais do Zetel.

## Evidencias necessarias

- Saidas de testes e gates com exit code.
- SHA local e SHA remota apos push.
- `git status --porcelain` vazio no fechamento.
- IDs/processos novos ou evidencia tecnica equivalente.
- Relatorios separados das duas revisoes.
- Medidas antes/depois pelo mesmo metodo.
- Handoff consumido pelo agente diferente sem transcript.

## Aprovacao

- Solicitante: aprovador humano da sessao de recuperacao.
- Data: 2026-07-30.
- Escopo aprovado: `SPEC-000-agent-workflow-pilot`.
- Decomposicao aprovada: tarefas 001 a 009, na ordem registrada.
- Decisoes arquiteturais aprovadas: Node.js ESM sem dependencias, fonte
  canonica local de skills, estado versionado e fallback quando um agente
  estiver indisponivel.
- Evidencia: solicitacao de recuperacao e retomada de 2026-07-30, que determina
  continuar o checkpoint seguro, concluir uma unica tarefa/checkpoint e fazer
  commit, push e handoff.

Alteracao material de escopo, decomposicao ou decisoes acima exige nova
aprovacao humana.
