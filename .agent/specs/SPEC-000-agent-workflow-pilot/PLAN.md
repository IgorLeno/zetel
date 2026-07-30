# Plano tecnico: SPEC-000

## Contexto tecnico

Zetel e um app Next.js 15/React 19/TypeScript com Vitest, Playwright,
better-sqlite3 e pnpm. O repositorio ja possui gates amplos, mas o contexto dos
agentes esta duplicado em dois arquivos de cerca de 40 KB e nao existe
orquestracao deterministica por spec/tarefa/sessao.

## Estado atual

- Branch base `main` alinhada com `origin/main` em `1bacc0b`.
- `AGENTS.md`: 300 linhas, 41.336 bytes.
- `CLAUDE.md`: 284 linhas, 40.684 bytes.
- Nenhuma skill local em `.agents/skills` ou `.claude/skills`.
- Planos anteriores em `docs/superpowers/plans/`.
- Historico e lessons em `spikes/lessons.md`.
- `.claude/settings.json` local/ignorado desabilita manualmente skills do
  Grimperium.

## Solucao

### 1. Modelo canonico

Criar `.agent/` como camada independente de agente para contexto, arquitetura,
comandos, qualidade, glossario, specs e sessoes. Manter `.agents/` e `.claude/`
como adaptadores de descoberta.

### 2. CLI

Implementar `agentctl` em Node.js ESM sem dependencias novas. Separar:

- dominio puro: estados, guardas, bloqueadores, budgets;
- infraestrutura: filesystem atomico, Git e execucao de processos;
- comandos: spec, task e session.

O executavel resolve o root por `git rev-parse --show-toplevel`, nunca por
caminho absoluto.

### 3. Estado

`state.json` guarda estado versionado de spec/tarefas e evidencias imutaveis
necessarias ao handoff. Dados efemeros de processo ficam em area ignorada. Toda
escrita usa arquivo temporario + rename e valida a revisao esperada para evitar
sobrescrita concorrente.

Subconjuntos:

- spec: `DRAFT`, `NEEDS_CLARIFICATION`, `READY_FOR_APPROVAL`, `APPROVED`,
  `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`, `PUSHED`, `SESSION_CLOSED`;
- task: `DRAFT`, `READY`, `IN_PROGRESS`, `VALIDATING`, `REVIEWING`, `BLOCKED`,
  `DONE`, `PUSHED`, `SESSION_CLOSED`;
- sessao: `IN_PROGRESS`, `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`,
  `PUSHED`, `SESSION_CLOSED`.

`BLOCKED` exige motivo e `return_to`. Transicoes de retorno continuam sujeitas
as guardas do destino.

### 4. Skills

Usar Agent Skills como formato basico. `.agents/skills/` e a fonte canonica
carregada pelo Codex. Claude recebe adaptadores por symlinks relativos
versionados, suportados pela versao instalada; um validador detecta ambiente
sem suporte e pode gerar adaptadores curtos como fallback.

Skills explicitas de spec/execucao usam ativacao manual. Skills de analise,
revisao e validacao podem ser sugeridas automaticamente, mas nunca avancam duas
tarefas nem fazem push sem o comando de fechamento.

### 5. Revisao

`task review` cria dois pacotes de entrada a partir do mesmo fixed point e da
spec aprovada. Os relatorios ficam separados em `reviews/`. A agregacao le
ambos somente depois de concluidos e falha se houver finding bloqueante.

### 6. Context-pack e nova sessao

O context-pack e gerado sob area runtime ignorada e contem links/copia reduzida
somente dos itens autorizados. `start-next` oferece `--check` para diagnostico e
testes. No modo real, usa:

- `codex -C <root> <prompt-do-context-pack>`;
- `claude <prompt-do-context-pack>`.

Nao usa `resume`, `continue`, `fork-session` ou transcript. O launcher faz
`exec`/spawn somente quando a sessao anterior esta fechada.

### 7. Adaptadores

Extrair o conteudo historico atual para documentos tematicos versionados antes
de encurtar `AGENTS.md` e `CLAUDE.md`. Ambos apontam para a mesma camada
compartilhada, mas preservam sintaxe e recursos especificos de cada agente.

### 8. Protocolo de commit e fechamento

Um handoff nao pode conter o SHA do mesmo commit que o cria: inserir o hash
altera o conteudo e, portanto, altera o proprio hash. Cada checkpoint usa:

1. commit de entrega com implementacao, testes, reviews e estado `DONE`;
2. push e confirmacao do SHA de entrega no remote;
3. handoff nomeado com o SHA curto da entrega e estado `SESSION_CLOSED`;
4. commit pequeno de fechamento, push e confirmacao do HEAD remoto;
5. verificacao final de arvore limpa.

O commit de fechamento nao entrega comportamento novo e nao inicia outra
tarefa. O campo `commit` da tarefa aponta para o commit de entrega; o handoff e
o estado registram separadamente o commit de fechamento quando ele ja estiver
disponivel, sem exigir autorreferencia.

## Alternativas rejeitadas

- Instalar Spec Kit: duplica o state machine e pode sobrescrever comandos.
- Instalar pacotes completos de skills: amplia catalogo e contexto sem
  necessidade comprovada.
- Manter `AGENTS.md` e `CLAUDE.md` espelhados manualmente: deriva com facilidade.
- Tornar worktree obrigatoria: contradiz a politica de risco aprovada.
- Hooks que formatam, commitam ou fazem push: efeitos ocultos e nao idempotentes.
- Loop autonomo que inicia a proxima tarefa: viola a fronteira de sessao.
- Persistir transcript: aumenta contexto e contradiz sessoes descartaveis.
- Usar issue tracker externo como fonte primaria: adiciona rede, credenciais e
  escrita externa sem necessidade.

## Componentes afetados

- Novos: `.agent/`, `.agents/skills/`, partes de `.claude/skills/`,
  `scripts/agentctl/`, `agentctl`, testes de workflow e relatorios.
- Alterados posteriormente: `AGENTS.md`, `CLAUDE.md`, `.gitignore`,
  `package.json` somente se necessario para atalho/teste.
- Nao afetados: `app/`, `components/`, `lib/`, migrations e dados do produto.

## Contratos

- Comandos e codigos de saida documentados em `.agent/COMMANDS.md`.
- `state.json` versionado e validado por schema interno.
- Relatorios de review possuem severidade, eixo, evidencia e status.
- Handoff possui todos os campos solicitados e budget maximo.
- Process launch nunca inclui flags de retomada.

## Estrategia de dados

- Markdown para artefatos humanos.
- JSON para estado validavel e metricas estruturadas.
- Escrita atomica e timestamps ISO 8601 UTC.
- Nenhum segredo ou conteudo de usuario.
- Estado efemero e context-pack runtime ignorados pelo Git.

## Estrategia de testes

1. Unitarios do dominio antes da implementacao.
2. Repositorio temporario com remote bare para integracao Git.
3. Executaveis fake para argumentos do launcher e session IDs.
4. Testes negativos de cada guarda.
5. Smoke das CLIs reais, sem chamada destrutiva.
6. Gates completos do Zetel antes de commit.

## Estrategia de rollout

Somente na branch do piloto. Ha um commit de entrega por spec/tarefa e um commit
pequeno de fechamento quando necessario para versionar handoff e estado depois
da confirmacao remota. Convergencia/Harvest pode produzir entrega separada.
Nao ha merge nem PR nesta fase.

## Rollback

Antes de merge, rollback e abandonar a branch. Depois de eventual aprovacao
futura para integrar, cada tarefa e revertivel por commit atomico em ordem
inversa. Nenhum dado, migration ou servico externo precisa de rollback.

## Riscos

- A versao instalada do Claude pode ter comportamento diferente da documentacao
  mais recente; testar carregamento real.
- Symlink relativo pode nao ser portavel para todos os clientes Git; validar e
  manter fallback.
- Gates completos podem expor falhas preexistentes; separar ruido de regressao.
- Alterar adapters pode ocultar regra historica; inventario de preservacao e
  teste de conteudo evitam perda silenciosa.

## Sequenciamento

1. Fundacao e validador de estado.
2. Lifecycle de spec.
3. Lifecycle de tarefa e gates.
4. Revisao em dois eixos.
5. Handoff e nova sessao.
6. Skills de spec.
7. Skills de tarefa/sessao.
8. Adaptadores, contexto e perfil Zetel.
9. Convergencia, Harvest, metricas e conclusao.

Cada item e uma tarefa/commit/push/sessao. Depois da tarefa 005, `start-next`
torna-se obrigatorio para todas as tarefas restantes.
