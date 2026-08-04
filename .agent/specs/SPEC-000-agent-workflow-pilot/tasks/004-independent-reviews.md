---
id: "004"
title: Revisao independente em dois eixos
status: SESSION_CLOSED
blocked_by: ["003A"]
writer: codex
reviewer: claude
commit: fb5d4ed897bc62644562f2b9e58e5534d13eb747
push: origin/feat/spec-000-task-004-independent-reviews
review_result: PASS
handoff: .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/004-independent-reviews-fb5d4ed.md
execution_profile: FULL
profile_justification: "Implementação do protocolo de revisões independentes, pacotes por eixo, agregação, evidências e integração com task close."
validation: PASS
validated_at: "2026-08-04T05:45:03.712Z"
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
