# Plano: Tema escuro antigo, toggle visível e logo legível

## Arquitetura
- `app/globals.css`: bloco `[data-theme='dark']` com os neutros de `06af66f`;
  regra `[data-theme='dark'] .rail-logo { background: var(--brand-creme) }`;
  estilo `.zetel-lockup-mark` com tile creme só no escuro.
- `components/ZetelLogo.tsx`: `ZetelLockup` envolve a marca em
  `<span className="zetel-lockup-mark">`.
- `app/icon.svg`: remove a media query escura (tile sempre creme).
- `next.config.ts`: `devIndicators: false`.
- `tests/unit/design-system/spec-009-brand.test.ts`: contrato atualizado
  (escuro = neutros antigos; ícone sem tile grafite) e novo
  `tests/unit/design-system/spec-010-dark-theme-logo.test.ts` (tile creme no
  escuro, wrapper do lockup, `devIndicators: false`).

## Verificacao
- `pnpm exec vitest run tests/unit/design-system`
- `pnpm typecheck`, `pnpm test:ci`, `pnpm build`, `pnpm test:coverage`
- `git diff --check`
- Navegador: escuro/claro em `/zetel`, `/configuracoes`, tela de estudo;
  mobile 375px; troca de tema pelo próprio toggle.
