---
id: "003"
title: "Configurar lista confiavel e teto diario"
status: DRAFT
blocked_by: ["002"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Aplicar RF7 e a parte configurável de RF8: editar a lista confiável e o
teto diário de buscas em Configurações > Geral.

## Criterios de aceitacao
- O `PUT /api/settings` aceita `web_search_domains` (array de 0–50
  domínios válidos, com curinga só como prefixo `*.`, normalizados em
  minúsculas e sem duplicatas) e `web_search_daily_limit` (inteiro
  1–200). Valor inválido retorna 400 sem gravar.
- O `GET` devolve a lista efetiva (padrão quando ausente) e o limite.
- A UI tem uma área de texto (um domínio por linha), o campo do teto e o
  botão "restaurar padrão", com feedback de erro. Funciona em claro,
  escuro e mobile 375px.
- A busca da 002 passa a usar os valores salvos.

## Testes
- `tests/integration/web-sources/search-settings.test.ts` (novo).
- Regressão: `tests/integration/tts-settings.test.ts`,
  `tests/integration/web-sources`.

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`. Sem revisão externa: mudança
  de formulário coberta por testes de validação.

## Escopo
- `app/api/settings/route.ts`, `lib/web-search-service.ts` (leitura dos
  settings), `components/ConfiguracoesForm.tsx`, testes.

## Riscos
- Lista vazia equivale a nenhum filtro: a UI avisa que, sem domínios, a
  busca usa a web aberta.
