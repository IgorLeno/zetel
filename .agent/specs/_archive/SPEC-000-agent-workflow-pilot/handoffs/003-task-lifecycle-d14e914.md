# Handoff — tarefa 003

- Spec: `SPEC-000-agent-workflow-pilot`
- Tarefa: `003` Lifecycle de tarefa e gates
- Writer: Claude Code
- Reviewer: Codex (processos separados)
- Perfil: `FULL`
- Delivery SHA: `d14e9149b4802bd0dcd3684e5afbb89a7a1fd8be`
- Remote: `origin/feat/spec-000-task-003-task-lifecycle-gates`

## Objetivo

Entregar `task next`, `start`, `validate` e `close` com uma tarefa por
sessao, perfis adaptativos e gates verificaveis.

## Comandos entregues

- `./agentctl task next`
- `./agentctl task start`
- `./agentctl task validate`
- `./agentctl task close`

## Decisoes principais

- Comandos focados via argv JSON (`--focused-json` / `--plan-file`), nunca shell.
- Gates proporcionais a FAST/STANDARD/FULL; E2E live fora do plano.
- Evidencia versionada com fingerprint/fixed point; reviews/evidence/state operacional fora do tree hash material.
- stdout/stderr brutos nao entram na evidencia; apenas digest + preview redigido.
- `task close` para em `DONE`; push/handoff/SESSION_CLOSED ficam para 005 (bootstrap aqui).

## Testes e gates

- Focados: `tests/unit/agentctl/` (inclui task-lifecycle).
- FULL via `task validate`: focados, build, test:ci, coverage, typecheck, diff-check.
- Fixed point: `3b53d6be8fd693afd90a93881ab3e05a2391dbce163f01dc254f5849f0e63ff9`

## Reviews

- `reviews/003-spec-compliance.md` PASS
- `reviews/003-engineering-quality.md` PASS (apos correcao de redacao)

## Limitacoes

- `task review` e `session close/start-next` nao implementados (004/005).
- SPEC-000 permanece com approval legada; `task start` exige integrity em specs novas.
- Checks externos assincronos; nao aguardados.

## Proxima tarefa

`004` — Revisao independente em dois eixos. Liberada para READY; nao iniciada.

## Checks externos

pending-not-waited
