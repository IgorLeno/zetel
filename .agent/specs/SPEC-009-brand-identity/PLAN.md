# Plano: Nova identidade visual — logo e paleta

## Arquitetura
- `components/ZetelLogo.tsx` (novo): `ZetelMark({ size, title? })` desenha os
  dois balões (polígonos com cantos arredondados via stroke round), a diagonal
  berinjela e as linhas de texto; `ZetelLockup({ className? })` = marca +
  "Zetel" + "parceiro de estudos".
- `components/Sidebar.tsx`: `rail-logo` passa a conter `ZetelMark`
  (link mantém `aria-label="Zetel — início"`).
- `components/HomeGreeting.tsx`: `ZetelLockup` acima da saudação.
- `app/icon.svg` (novo): squircle creme + marca; dark via media query interna.
- `app/globals.css`: tokens `--brand-*`; neutros claro/escuro; `.rail-logo`
  vira squircle de superfície; estilos `.zetel-lockup`; `.app-glow` com cores
  da marca; regra mobile do `.rail-logo` ajustada.
- `tests/unit/design-system/spec-009-brand.test.ts` (novo): contrato de tokens,
  contraste AA (cálculo de luminância relativa WCAG no próprio teste), ícone SVG
  autocontido e uso da marca no trilho/tela inicial.

## Verificacao
- `pnpm exec vitest run tests/unit/design-system`
- `pnpm typecheck`, `pnpm test:ci`, `pnpm build`, `pnpm test:coverage`
- `git diff --check`
- Navegador: `/zetel` e uma tela de estudo em claro, escuro e mobile (375px);
  favicon carregando de `/icon.svg`.
