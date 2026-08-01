---
id: "005"
title: Handoff e nova sessao
status: DRAFT
blocked_by: ["004"]
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Entregar `session handoff` e `session start-next` com guardas Git e processo
novo.

## Comportamento entregue

Handoff curto e context-pack sao gerados; fechamento confirma SHA remoto e
arvore limpa; o launcher inicia Codex ou Claude sem qualquer retomada.

## Criterios de aceitacao

- Handoff contem todos os campos solicitados e respeita budget.
- `SESSION_CLOSED` exige:
  - commit de entrega publicado;
  - handoff e `state.json` atualizados;
  - commit separado de fechamento;
  - commit de fechamento presente no remote;
  - working tree limpa;
  - branch sincronizada com o remote.
- A confirmacao do fechamento e derivada do Git/remote (ou evidencia externa
  versionada posteriormente). Nao se exige autorreferencia do SHA dentro do
  proprio commit de fechamento.
- `start-next --check` valida sem iniciar processo.
- Launch real usa processo novo e nao inclui `resume`, `continue` ou transcript.
- Executaveis fake provam argumentos, cwd e captura opcional de session ID.
- Invocacao enquanto a sessao anterior esta ativa falha.

## Testes focados

Repositorio temporario com remote bare, dirty tree, remote atrasado, fake CLIs,
idempotencia e budget do context-pack.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`scripts/agentctl/session-*`, templates de handoff/context-pack, `.gitignore`.

## Fora de escopo

Resume, tmux obrigatorio, worktree obrigatoria ou loop de varias tarefas.

## Riscos

Handoff escrito apos commit deixar dirty tree; falso positivo de sincronizacao.

## Resultado da revisao

Pendente.
