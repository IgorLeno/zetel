---
id: "001"
title: Fundacao e state machine
status: READY
blocked_by: []
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
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

Pendente.
