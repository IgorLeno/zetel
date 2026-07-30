---
id: "002"
title: Lifecycle de spec
status: DRAFT
blocked_by: ["001"]
writer: codex
reviewer: claude
commit: null
push: null
review_result: pending
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

Pendente.
