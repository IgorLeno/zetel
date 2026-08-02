---
id: "007"
title: Skills de tarefa, revisao e sessao
status: DRAFT
blocked_by: ["006"]
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Criar e validar `spec-start-task`, `spec-implement-task`, `spec-review-task`,
`spec-close-task`, `session-handoff` e `session-start-next`.

## Comportamento entregue

Cada skill opera uma unica fase/tarefa, delega guardas ao `agentctl` e para
diante de decisao, scope change, gate ou review bloqueante.

## Criterios de aceitacao

- Execucao e fechamento sao explicitamente invocados.
- Skills nao recebem permissao ampla de rede, deploy ou escrita externa.
- `spec-review-task` preserva os dois eixos separados.
- `session-start-next` nunca e invocada pela propria sessao antes do fechamento.
- Testes demonstram que uma segunda tarefa nao e iniciada.
- Carregamento e budget sao medidos nos dois agentes quando operacionais.

## Testes focados

Frontmatter, guardas, invocacao real/dry-run e tentativa de encadear tarefas.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`.agents/skills/`, `.claude/skills/`, testes.

## Fora de escopo

Convergencia, Harvest e skills tecnologicas.

## Riscos

Skill substituir enforcement deterministico por instrucao textual.

## Resultado da revisao

Pendente.
