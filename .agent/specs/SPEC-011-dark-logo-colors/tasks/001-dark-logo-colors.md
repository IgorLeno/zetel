---
id: "001"
title: "Cores da marca no tema escuro"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: FULL
profile_justification: "Mudanca visual transversal: cores da marca por tema, CSS global e favicon; sem state machine, escrita atomica, seguranca ou banco"
validation: PASS
validated_at: "2026-10-04T20:37:56.300Z"
---

## Objetivo
Aplicar SPEC D1–D3: marca sem tile no escuro, com variante de cor legível e
confortável; claro inalterado.

## Criterios de aceitacao
- Nenhuma regra de tile creme no escuro; `.rail-logo` usa `--surface`.
- Escuro: `zm-top #e3b39c`, `zm-bottom #b6aadb`, `zm-diag #8c79ab`,
  `zm-lines #4e3d63`; claro com as cores da SPEC-009.
- Diagonal ≥ 3:1 sobre `--bg` e `--surface` escuros; linhas ≥ 3:1 sobre os
  balões escuros.
- Favicon creme no claro e `#28221e` com variante escura no escuro.

## Testes
- `tests/unit/design-system/spec-011-dark-logo-colors.test.ts` (novo),
  `spec-010-dark-theme-logo.test.ts` e `spec-009-brand.test.ts`
  (atualizados), `spec-002-visual-contract.test.ts` (regressão).

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`; validação visual no navegador.

## Escopo
- `components/ZetelLogo.tsx`, `app/globals.css`, `app/icon.svg`, testes em
  `tests/unit/design-system/`.

## Riscos
- Duas variantes de cor da marca; mitigado por contrato que fixa os hex.
- Favicon segue o esquema do sistema, não o cookie do app (como na SPEC-009).
