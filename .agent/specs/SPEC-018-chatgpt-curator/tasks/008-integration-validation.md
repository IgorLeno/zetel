---
id: "008"
title: "Fluxo integrado, E2E nao-live e validacao humana"
status: DRAFT
blocked_by: ["007"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Ciclo completo ChatGPT → canal → Zetel → canal → ChatGPT validado.

## Perfil planejado
`STANDARD`, uma revisão `engineering-quality`.

## Criterios de aceitacao
- E2E Playwright não-live: importar fixture, curar com mock, confirmar,
  publicar para bare local.
- Validação humana: relatório real do ChatGPT importado sem ajuste manual;
  nova conversa no ChatGPT cita conteúdo do `CONTEXTO.md`.
- Ajustes de template registrados em `docs/CHATGPT_REPORT_TEMPLATE.md`.

## Testes
E2E não-live; live só sob as quatro condições do adapter.

## Gates
STANDARD: focados, `pnpm typecheck`, `pnpm test:ci`, `git diff --check`.

## Escopo
`tests/e2e/curator.spec.ts`, fixtures, ajustes pequenos de UI.

## Riscos
Validação humana depende do ChatGPT; registrar resultado sem bloquear gates.
