---
id: "003"
title: Lifecycle de tarefa e gates
status: READY
blocked_by: ["002C"]
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Entregar `task next`, `start`, `validate` e `close` com uma tarefa por sessao,
perfil adaptativo e gates verificaveis.

## Comportamento entregue

A proxima tarefa desbloqueada e deterministica; iniciar outra tarefa falha;
`task validate` seleciona gates pelo `execution_profile`; `task close` exige
somente evidencias e reviews aplicaveis ao perfil.

## Criterios de aceitacao

- `next` ignora bloqueadas e encerradas.
- `start` exige spec aprovada, writer unico e nenhuma sessao ativa.
- `validate` executa focados declarados e gates aplicaveis sem E2E live.
- `close` falha sem evidencias recentes aplicaveis ou com finding bloqueante.
- FAST nao exige review externo.
- STANDARD exige no maximo uma revisao e uma rodada.
- FULL pode exigir duas revisoes quando os dois eixos forem materialmente uteis.
- Checks externos `pending` nao mantem a sessao aberta.
- Escalar perfil e permitido; downgrade exige justificativa ou aprovacao humana.
- Waiver exige registro humano e nunca mascara o resultado original.

## Testes focados

Guardas, ordenacao, freshness de gate, comando falhando e tentativa de segunda
tarefa.

## Gates por perfil

Aplicar `.agent/EXECUTION_PROFILES.md` e `.agent/QUALITY.md`. Nunca prometer gates
completos para FAST ou STANDARD; `git diff --check` permanece comum.

## Arquivos ou areas provaveis

`scripts/agentctl/task-*`, runner de comandos, `.agent/QUALITY.md`, testes.

## Fora de escopo

Automatizar reviews ou iniciar nova CLI.

## Riscos

Gate falso-positivo por cache, comando parcial, timestamp reutilizado ou perfil
reduzido sem justificativa.

## Resultado da revisao

Pendente.
