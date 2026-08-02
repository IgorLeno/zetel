---
id: "002"
title: Lifecycle de spec
status: DONE
blocked_by: ["001B"]
writer: codex
reviewer: claude
commit: null
push: null
review_result: PASS
handoff: null
---

## Objetivo

Entregar `agentctl spec create`, `approve` e `status` com templates completos e
aprovacao rastreavel.

## Comportamento entregue

Mini-spec e spec completa podem ser criadas sem sobrescrita; aprovacao valida
artefatos, questoes abertas e identidade do aprovador antes de liberar tarefas.

## Criterios de aceitacao

- IDs/slug seguros e colisao falha sem alterar o existente.
- `approve` exige spec, plano, tarefas, arquivos individuais e confirmacao
  humana explicita.
- Aprovacao registra hash dos artefatos; mudanca posterior invalida aprovacao.
- `status` distingue pendencia, aprovado e adulterado.

## Testes focados

Unitarios de templates/hashes e integracao em diretorio temporario.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`scripts/agentctl/spec-*`, templates em `.agent/`, testes.

## Fora de escopo

Lifecycle de tarefa, Git remoto e processo de agente.

## Riscos

Aprovacao ambigua ou preservada depois de alteracao material.

## Resultado da revisao

Duas revisoes Claude independentes sobre o fixed point final passaram:
`reviews/002-spec-compliance.md` e
`reviews/002-engineering-quality.md`. O unico finding bloqueante da rodada 1,
teste de artefato aprovado removido, foi corrigido; classificacoes e
justificativas estao em `reviews/002-findings-resolution.md`.
