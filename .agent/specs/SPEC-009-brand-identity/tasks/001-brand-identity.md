---
id: "001"
title: "Logo SVG e paleta da marca"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: FULL
profile_justification: "Mudanca visual transversal: tokens globais de tema claro/escuro, componente de logo e icone do app; sem state machine, escrita atomica, seguranca ou banco"
validation: PASS
validated_at: "2026-10-04T12:07:56.154Z"
---

## Objetivo
Aplicar a identidade aprovada (SPEC D1–D4): marca e lockup em SVG, trilho,
tela inicial, favicon claro/escuro e neutros dos temas na paleta da marca.

## Criterios de aceitacao
- Trilho mostra a marca SVG (não mais o "z" em texto), com rótulo acessível.
- Tela inicial mostra o lockup "Zetel / parceiro de estudos".
- `/icon.svg` servido como favicon; squircle creme no esquema claro e grafite
  no escuro; sem referências externas.
- Tokens `--brand-*` presentes; `--bg` = Creme e `--text` = Grafite no claro.
- `--text`/`--text-2` ≥ 4.5:1 sobre `--bg`/`--surface` nos dois temas;
  `--text-3` com contraste ≥ ao anterior.
- `--partner-*`, `--p` e `--accent` inalterados; artefatos HTML intocados.

## Testes
- `tests/unit/design-system/spec-009-brand.test.ts` (novo) e
  `tests/unit/design-system/spec-002-visual-contract.test.ts` (regressão).

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`; validação visual no navegador
  (claro/escuro/mobile).

## Escopo
- `components/ZetelLogo.tsx` (novo), `components/Sidebar.tsx`,
  `components/HomeGreeting.tsx`, `app/icon.svg` (novo), `app/globals.css`,
  `tests/unit/design-system/spec-009-brand.test.ts` (novo).

## Riscos
- Recalibrar neutros muda o tom de todas as telas; mitigado por contrato de
  contraste e revisão visual nos dois temas.
- Wordmark depende de Fraunces carregar; fallback serifado (Georgia) mantém
  legibilidade.
- Favicon segue o esquema do sistema, não o tema do app (D3). Aceito.
