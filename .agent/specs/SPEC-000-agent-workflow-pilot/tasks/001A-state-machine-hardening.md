---
id: "001A"
title: Endurecimento das invariantes e escrita concorrente
status: SESSION_CLOSED
blocked_by: ["001"]
writer: grok
reviewer: agente ou subagente separado
commit: "6f91b87476942d0bd6aa53295c283fdbfcdf6af5"
push: "origin/chore/spec-session-workflow-pilot"
review_result: PASS
handoff: ".agent/specs/SPEC-000-agent-workflow-pilot/handoffs/001A-hardening-6f91b87.md"
---

## Objetivo

Corrigir findings pos-entrega da tarefa 001 (state machine, escrita atomica,
CLI e documentacao) antes do merge e antes de iniciar a tarefa 002.

## Comportamento entregue

- `BLOCKED.return_to` igual ao estado interrompido (sem fuga para terminais).
- `READY -> IN_PROGRESS` exige `context.task` e `context.tasks`.
- Invariantes cruzadas tarefa/active_task/sessao.
- Integridade de `blocked_by` (existencia, autorreferencia, duplicatas, ciclos).
- Escrita atomica com lock, releitura, fsync de diretorio e testes concorrentes.
- CLI com usage/help corretos, `process.exitCode`, launcher ESM seguro e
  falhas Git distinguiveis.

## Criterios de aceitacao

- Matriz de findings em `reviews/001A-findings-resolution.md`.
- Testes negativos obrigatorios da solicitacao 001A passam.
- Gates focados e completos verdes.
- Reviews em dois eixos.
- Tarefa 002 permanece nao iniciada (DRAFT durante a correcao; READY apos
  fechamento da 001A).
- Nenhum codigo funcional do Zetel alterado.

## Bootstrap de estado

Excecao aprovada: como os comandos de lifecycle ainda nao existem, a mutacao
inicial de `state.json` que registra a 001A e reencadeia a 002 usa
`writeJsonAtomic` com `expectedRevision` atual (uma revisao por mutacao).

## Testes focados

`pnpm exec vitest run tests/unit/agentctl --reporter=verbose`

## Gates obrigatorios

Testes focados; `pnpm build`; `pnpm test:ci`; `pnpm test:coverage`;
`pnpm typecheck`; `git diff --check`; `./agentctl spec status SPEC-000-agent-workflow-pilot`.

## Fora de escopo

Merge, pull request, tarefa 002, E2E live, OpenRouter.

## Resultado da revisao

`PASS` — ver `reviews/001A-spec-compliance.md` e
`reviews/001A-engineering-quality.md`.
