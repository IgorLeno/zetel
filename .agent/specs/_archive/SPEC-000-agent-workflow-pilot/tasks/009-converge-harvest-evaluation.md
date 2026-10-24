---
id: "009"
title: Convergencia, Harvest e avaliacao
status: DRAFT
blocked_by: ["008"]
writer: claude
reviewer: codex
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Entregar `spec converge`, `knowledge-harvest`, preencher relatorios e decidir
se o piloto pode alimentar `agent-policy`.

## Comportamento entregue

Convergencia cruza criterios/evidencias, Harvest cria candidatos sem promocao
automatica e a avaliacao compara sessoes/agentes com amostra pequena.

## Criterios de aceitacao

- Skills `spec-converge` e `knowledge-harvest` validadas.
- Convergencia falha com criterio sem evidencia, tarefa aberta ou rollback
  ausente.
- Harvest segue inbox -> classificacao -> dedupe -> evidencia -> proposta.
- Promocao exige aprovacao humana/gate e mantem historico/rollback.
- Relatorios usam dados reais e declaram qualquer comparacao bloqueada.
- Trocas Codex/Claude, handoff, idempotencia, gates e correcoes sao avaliados.
- Recomendacao final diz manter, ajustar ou rejeitar cada grupo de skills.

## Testes focados

Convergencia incompleta/completa, dedupe de Harvest, promocao bloqueada e
metricas estruturadas.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

Skills finais, `scripts/agentctl/converge-*`, `harvest/`, relatorios do piloto.

## Fora de escopo

Promover regras globais, migrar outros projetos ou fazer merge.

## Riscos

Concluir com evidencia parcial ou transformar Harvest em memoria automatica sem
governanca.

## Resultado da revisao

Pendente.
