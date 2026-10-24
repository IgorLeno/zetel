---
id: "001"
title: Fundacao e state machine
status: SESSION_CLOSED
blocked_by: []
writer: cursor
reviewer: cursor-subagent
commit: "5ec1d7b93e76f8a02ac27e287ffc3f019dbb0542"
push: "origin/chore/spec-session-workflow-pilot"
review_result: pass
handoff: ".agent/specs/SPEC-000-agent-workflow-pilot/handoffs/001-foundation-5ec1d7b.md"
---

## Objetivo

Criar a estrutura base `.agent/`, o dominio puro da state machine e
`agentctl spec status`.

## Comportamento entregue

O repositorio valida `state.json`, recusa transicoes invalidas, detecta tarefa
bloqueada e apresenta status sem modificar arquivos.

## Criterios de aceitacao

- Estrutura base e contratos de JSON documentados.
- Escrita futura preparada para operacao atomica e controle de revisao.
- Testes cobrem caminho valido, salto invalido, `BLOCKED`, duas tarefas ativas
  e schema malformado.
- `status` e somente leitura e retorna exit code nao zero para estado invalido.

## Testes focados

Testes unitarios do dominio e smoke do comando `spec status`.

## Gates obrigatorios

Testes focados; gates completos definidos em `.agent/QUALITY.md`;
`git diff --check`.

## Arquivos ou areas provaveis

`.agent/`, `scripts/agentctl/`, `agentctl`, testes de workflow.

## Fora de escopo

Criar/aprovar specs, executar gates, revisar, commit, push ou iniciar agentes.

## Riscos

Misturar estado de spec, tarefa e sessao; aceitar JSON editado fora das guardas.

## Resultado da revisao

`PASS` nos eixos spec compliance e engineering quality
(`.agent/specs/SPEC-000-agent-workflow-pilot/reviews/001-*.md`).
