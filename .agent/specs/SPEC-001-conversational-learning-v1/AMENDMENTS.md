# SPEC-001 — Registros pós-aprovação (fora do hash de aprovação)

Os artefatos aprovados (`SPEC.md`, `PLAN.md`, `TASKS.md`, `tasks/*.md`) foram
restaurados em 2026-09-30 ao conteúdo aprovado em `5ff89b9`, para devolver a
integridade da aprovação (`./agentctl spec status` = APPROVED). Os registros
abaixo foram escritos diretamente nos arquivos de tarefa depois da aprovação,
em execuções fora do lifecycle do `agentctl`. Ficam preservados aqui, sem
valor de aprovação: mudar critérios da 012 exige nova aprovação humana.

Decisão: Igor Fernandes em chat, 2026-09-30. O barge-in por voz foi para
`SPEC-003-voice-barge-in`.

## Tarefa 011 — acréscimo pós-aprovação (commit 612b959)

### Plano de execução em main (2026-09-27)

`execution_profile: FULL` pelo contrato de segurança, proveniência e escrita no vault. Por instrução explícita desta execução, os gates serão o smoke real, testes focados, typecheck e diff-check; sem gates FULL amplos ou lifecycle antigo.

- [x] Inspecionar os contratos de chat, fontes, mensagens, sugestões e escrita no vault.
- [x] Estender a sentinela e o fluxo de chat para sugestão de conceito validada e persistida apenas em metadata.
- [x] Implementar serviço/rota de conceitos com proveniência reconstruída no servidor, dedupe e append seguro.
- [x] Integrar `ConceptCard` ao chat com Salvar, Explorar e Ignorar.
- [x] Rodar o produto com PDF real e verificar create, append e ignore; corrigir problemas observados.
- [x] Executar testes focados, `pnpm typecheck` e `git diff --check`.
- [x] Revisar o diff, registrar o resultado, commitar e enviar `main` a `origin`.

Resultado: o primeiro `next dev` compartilhou `.next` com outro servidor e causou recargas/404 intermitentes; o smoke passou em cópia temporária do checkout, com build próprio. A revisão automática bloqueou inicialmente o envio do PDF ao OpenRouter; após autorização explícita do usuário, três chamadas live foram feitas. A primeira recebeu HTTP 429 (`mistralai/mistral-small-2603`); a segunda respondeu em linguagem natural sem sentinela; ajustada a regra de pedido explícito, a terceira (`openai/gpt-4o-mini`) emitiu `CONCEITO_SUGERIDO`, renderizou o cartão com `termo.pdf · p. 1` e permitiu edição e append ao conceito existente. O create inicial, outro append e o Ignorar também passaram na UI com sugestões de smoke persistidas na base temporária. O Markdown e as flags foram conferidos. Três testes focados, typecheck e diff-check passaram. Sem chamadas live restantes para exercitar Explorar.

## Tarefa 012 — versão reescrita pós-aprovação (commits a708d95, dbc000c)

Título proposto: "Verificação de integração estrutural da V1". Critérios,
testes, gates e escopo abaixo divergem do aprovado e não substituem a versão
aprovada sem nova aprovação.

### Objetivo

Verificar estruturalmente a integração das capacidades da V1 e corrigir lacunas reais de contrato/backend. A validação visual e interativa fica com o proprietário do projeto.

### Perfil planejado

`execution_profile`: `FULL`. A correção de ownership na rota de memória eleva o perfil por tocar uma fronteira de segurança. O proprietário determinou expressamente testes estruturais focados, typecheck e diff-check nesta execução, sem gates longos ou validação em navegador; essa restrição de escopo prevalece sobre a lista padrão do perfil. O lifecycle antigo do `agentctl` foi dispensado.

### Criterios de aceitacao

- Inventário das capacidades V1 com contratos de entrada/saída, sessão/chat e persistência conferidos.
- Nenhuma lacuna estrutural conhecida impede o teste manual do proprietário.
- Apenas lacunas comprovadas são corrigidas, sem redesign visual.

### Testes

Testes unitários/integrados focados das integrações relevantes. Sem novo E2E de browser.

### Gates

Focados úteis; `pnpm typecheck`; `git diff --check`.

### Escopo

Arquivos ou áreas prováveis: `components/`, rotas `/api/zetels/`, serviços `lib/`, testes focados.

Fora de escopo: novas features, redesign visual, validação em navegador e E2E live.

### Riscos

Evitar inferir funcionamento visual de contratos estruturais. O proprietário validará a experiência no produto.

### Plano de execução direta em main (2026-09-28)

- [x] Inventariar as capacidades V1 e traçar seus contratos de frontend, APIs, serviços e persistência.
- [x] Corrigir somente lacunas estruturais comprovadas.
- [x] Rodar testes focados úteis, `pnpm typecheck` e `git diff --check`.
- [x] Registrar a matriz de integração, revisar o diff, fazer o commit solicitado e enviar `main` a `origin/main`.

Perfil efetivo desta execução: `FULL` após a correção de ownership da memória. Conforme atualização do proprietário, a validação visual/interativa é feita pelo usuário; esta execução não usa navegador nem cria E2E.

### Resultado estrutural

- Contratos percorridos: ingestão/leitura PDF, foco e seleção, sessões/retomada, retrieval/fontes, perfil, voz/cancelamento, starters, conceitos, notas e memória.
- Lacunas corrigidas: criação duplicada de sessão na montagem do chat; associação de memória a uma mensagem fora do Zetel de origem; frontmatter de memória com ID/modelo fornecidos pelo cliente em vez do slug/modelo da origem validada.
- Verificação: 15 arquivos de teste focado, 87 testes aprovados; `pnpm typecheck` e `git diff --check` aprovados.
- Validação visual e interativa permanece com o proprietário; nenhum E2E de navegador foi criado.
