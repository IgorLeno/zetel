---
id: "003"
title: Lifecycle de tarefa e gates
status: DRAFT
blocked_by: ["002A"]
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Entregar `task next`, `start`, `validate` e `close` com uma tarefa por sessao e
gates verificaveis.

## Comportamento entregue

A proxima tarefa desbloqueada e deterministica; iniciar outra tarefa falha;
validacao registra comandos/exit codes; fechar exige gates e reviews validos.

## Criterios de aceitacao

- `next` ignora bloqueadas e encerradas.
- `start` exige spec aprovada, writer unico e nenhuma sessao ativa.
- `validate` executa focados declarados e gates aplicaveis sem E2E live.
- `close` falha sem evidencias recentes ou com review pendente/bloqueante.
- Waiver exige registro humano e nunca mascara o resultado original.

## Testes focados

Guardas, ordenacao, freshness de gate, comando falhando e tentativa de segunda
tarefa.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`scripts/agentctl/task-*`, runner de comandos, `.agent/QUALITY.md`, testes.

## Fora de escopo

Automatizar reviews ou iniciar nova CLI.

## Riscos

Gate falso-positivo por cache, comando parcial ou timestamp reutilizado.

## Resultado da revisao

Pendente.
