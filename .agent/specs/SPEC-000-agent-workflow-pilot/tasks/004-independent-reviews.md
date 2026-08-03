---
id: "004"
title: Revisao independente em dois eixos
status: DRAFT
blocked_by: ["003A"]
writer: codex
reviewer: claude
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Entregar `agentctl task review` com spec compliance e engineering quality
independentes.

## Comportamento entregue

Dois pacotes usam o mesmo fixed point, geram relatorios separados e so entao
sao agregados. Finding bloqueante impede fechamento.

## Criterios de aceitacao

- Fixed point, commits e diff sao resolvidos antes da revisao.
- Review de spec recebe spec/tarefa/diff; review de qualidade recebe regras,
  arquitetura/diff sem o resultado do outro eixo.
- Schema exige severidade, evidencia, arquivo/linha quando aplicavel e status.
- Agregador falha com eixo ausente, evidencia invalida ou bloqueante aberto.
- Escritor nao pode autoaprovar os dois eixos.

## Testes focados

Pacotes, isolamento, relatorio invalido, bloqueante e resolucao de finding.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`scripts/agentctl/review-*`, templates/reviews, testes.

## Fora de escopo

Ultrareview/cloud review, PR ou subagentes obrigatorios.

## Riscos

Contaminacao entre eixos e review sem diff completo.

## Resultado da revisao

Pendente.
