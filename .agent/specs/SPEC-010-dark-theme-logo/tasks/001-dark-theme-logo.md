---
id: "001"
title: "Tema escuro antigo, toggle visivel e logo legivel"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: FULL
profile_justification: "Mudanca de tokens globais do tema escuro, tile do logo, favicon e config de dev do Next; sem state machine, escrita atomica, seguranca ou banco"
validation: PASS
validated_at: "2026-10-04T12:59:31.088Z"
---

## Objetivo
Aplicar SPEC D1–D4: tema escuro anterior, toggle sem sobreposição do indicador
dev e marca legível no escuro.

## Criterios de aceitacao
- Os 13 neutros do `[data-theme='dark']` iguais aos de `06af66f`; tema claro
  sem mudança.
- `--text`/`--text-2` ≥ 4.5:1 sobre `--bg`/`--surface`/`--reading-bg` nos
  dois temas; `--text-3` escuro sobre `--surface` ≥ 4.15.
- Em `next dev`, o centro do toggle de tema é o próprio botão (sem portal do
  Next por cima) e a troca funciona pelo clique.
- No escuro, `.rail-logo` e o tile do lockup são creme; favicon sempre creme.
- `--partner-*`, `--p`, `--accent` e artefatos HTML intocados.

## Testes
- `tests/unit/design-system/spec-009-brand.test.ts` (atualizado),
  `tests/unit/design-system/spec-010-dark-theme-logo.test.ts` (novo) e
  `tests/unit/design-system/spec-002-visual-contract.test.ts` (regressão).

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`; validação visual no navegador.

## Escopo
- `app/globals.css`, `components/ZetelLogo.tsx`, `app/icon.svg`,
  `next.config.ts`, testes em `tests/unit/design-system/`.

## Riscos
- `devIndicators: false` remove o indicador de build/rota em dev; o overlay
  de erros continua. Exige reiniciar o `next dev` do Igor.
- Tile creme no escuro é um bloco claro no trilho; aceito pelo Igor (D3).
