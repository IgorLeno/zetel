---
id: "003"
title: Lifecycle de tarefa e gates
status: SESSION_CLOSED
blocked_by: ["002C"]
writer: claude
reviewer: codex
commit: d14e9149b4802bd0dcd3684e5afbb89a7a1fd8be
push: origin/feat/spec-000-task-003-task-lifecycle-gates
review_result: PASS
handoff: .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/003-task-lifecycle-d14e914.md
execution_profile: FULL
profile_justification: "Implementação de lifecycle, state machine, execução de processos, persistência atômica e validação de evidências."
validation: PASS
validated_at: "2026-08-03T12:35:35.314Z"
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

Dois reviews PASS no fixed point
`3b53d6be8fd693afd90a93881ab3e05a2391dbce163f01dc254f5849f0e63ff9`:
`003-spec-compliance.md` e `003-engineering-quality.md` (apos correcao de
redacao de stdout/stderr na evidencia).
