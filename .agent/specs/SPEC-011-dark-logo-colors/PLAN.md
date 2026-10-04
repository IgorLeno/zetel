# Plano: Cores da marca no tema escuro

## Arquitetura
- `components/ZetelLogo.tsx`: classes `zm-*` nos elementos do `ZetelMark`;
  lockup sem wrapper `.zetel-lockup-mark`.
- `app/globals.css`: remove `[data-theme='dark'] .rail-logo` e
  `.zetel-lockup-mark`; adiciona as regras `[data-theme='dark'] .zetel-mark
  .zm-*` com a variante escura.
- `app/icon.svg`: classes nos elementos e media query escura.
- Testes: `spec-010-dark-theme-logo.test.ts` perde as asserções de tile;
  novo `spec-011-dark-logo-colors.test.ts`.

## Verificacao
- `pnpm exec vitest run tests/unit/design-system`
- `pnpm typecheck`, `pnpm test:ci`, `pnpm build`, `pnpm test:coverage`
- `git diff --check`
- Navegador: escuro/claro em `/zetel`, `/configuracoes`; mobile 375px.
