---
id: "012"
title: "Verificação de integração estrutural da V1"
status: READY
blocked_by: ["004", "006", "007", "009", "011"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Verificar estruturalmente a integração das capacidades da V1 e corrigir lacunas reais de contrato/backend. A validação visual e interativa fica com o proprietário do projeto.

## Perfil planejado

`execution_profile`: `FULL`. A correção de ownership na rota de memória eleva o perfil por tocar uma fronteira de segurança. O proprietário determinou expressamente testes estruturais focados, typecheck e diff-check nesta execução, sem gates longos ou validação em navegador; essa restrição de escopo prevalece sobre a lista padrão do perfil. O lifecycle antigo do `agentctl` foi dispensado.

## Criterios de aceitacao

- Inventário das capacidades V1 com contratos de entrada/saída, sessão/chat e persistência conferidos.
- Nenhuma lacuna estrutural conhecida impede o teste manual do proprietário.
- Apenas lacunas comprovadas são corrigidas, sem redesign visual.

## Testes

Testes unitários/integrados focados das integrações relevantes. Sem novo E2E de browser.

## Gates

Focados úteis; `pnpm typecheck`; `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: `components/`, rotas `/api/zetels/`, serviços `lib/`, testes focados.

Fora de escopo: novas features, redesign visual, validação em navegador e E2E live.

## Riscos

Evitar inferir funcionamento visual de contratos estruturais. O proprietário validará a experiência no produto.

## Plano de execução direta em main (2026-09-28)

- [x] Inventariar as capacidades V1 e traçar seus contratos de frontend, APIs, serviços e persistência.
- [x] Corrigir somente lacunas estruturais comprovadas.
- [x] Rodar testes focados úteis, `pnpm typecheck` e `git diff --check`.
- [x] Registrar a matriz de integração, revisar o diff, fazer o commit solicitado e enviar `main` a `origin/main`.

Perfil efetivo desta execução: `FULL` após a correção de ownership da memória. Conforme atualização do proprietário, a validação visual/interativa é feita pelo usuário; esta execução não usa navegador nem cria E2E.

## Resultado estrutural

- Contratos percorridos: ingestão/leitura PDF, foco e seleção, sessões/retomada, retrieval/fontes, perfil, voz/cancelamento, starters, conceitos, notas e memória.
- Lacunas corrigidas: criação duplicada de sessão na montagem do chat; associação de memória a uma mensagem fora do Zetel de origem; frontmatter de memória com ID/modelo fornecidos pelo cliente em vez do slug/modelo da origem validada.
- Verificação: 15 arquivos de teste focado, 87 testes aprovados; `pnpm typecheck` e `git diff --check` aprovados.
- Validação visual e interativa permanece com o proprietário; nenhum E2E de navegador foi criado.
