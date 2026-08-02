---
id: "001B"
title: Fechamento das invariantes remanescentes
status: IN_PROGRESS
blocked_by: ["001A"]
writer: grok
reviewer: agente ou subagente separado
commit: null
push: null
review_result: PASS
handoff: null
---

## Objetivo

Fechar invariantes remanescentes apos a 001A: saida invalida de `BLOCKED`,
rastreabilidade de sessoes `DONE`/`PUSHED`, acoplamento tarefa ativa/sessao
ativa, semantica de `session.status` ausente vs `null`, contrato de `fsync` do
diretorio e inconsistencias documentais — antes do merge e sem iniciar a 002.

## Comportamento entregue

- Saida de `BLOCKED` exige `return_to` em `statusesThatCanBlock(entity)`.
- Sessao `DONE`/`PUSHED` exige `task_id`, tarefa existente com status igual,
  `active_task` null e nenhuma tarefa ativa.
- Tarefa ativa ⇔ `active_task` preenchido ⇔ sessao ativa correspondente.
- Propriedade `session.status` ausente e invalida; `status: null` so sem trabalho ativo.
- `fsyncDirectoryBestEffort` documentado; falha pos-rename nao vira falsa falha.
- Parametro morto `seenIds` removido; timeout 15s no teste concorrente.

## Criterios de aceitacao

- Matriz em `reviews/001B-findings-resolution.md`.
- Testes negativos obrigatorios da solicitacao 001B passam.
- Gates focados e completos verdes (`reviews/001B-gates.md`).
- Reviews em dois eixos: `PASS`.
- Tarefa 002 permanece nao iniciada (`DRAFT` durante a correcao; `READY` apos
  fechamento da 001B).
- Nenhum codigo funcional do Zetel alterado.

## Bootstrap de estado

Excecao aprovada: como os comandos de lifecycle ainda nao existem, a mutacao
inicial de `state.json` que registra a 001B e reencadeia a 002 usa
`writeJsonAtomic` com `expectedRevision` atual (uma revisao por mutacao).

## Testes focados

`pnpm exec vitest run tests/unit/agentctl --reporter=verbose`

## Gates obrigatorios

Testes focados; `pnpm build`; `pnpm test:ci`; `pnpm test:coverage`;
`pnpm typecheck`; `git diff --check`; `./agentctl spec status SPEC-000-agent-workflow-pilot`.

## Fora de escopo

Merge, pull request, tarefa 002, E2E live, OpenRouter.

## Resultado da revisao

`PASS` — ver `reviews/001B-spec-compliance.md` e
`reviews/001B-engineering-quality.md`.

Limitacao: writer e reviewer da mesma familia de fornecedor (Cursor).
