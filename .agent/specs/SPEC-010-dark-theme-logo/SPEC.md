# SPEC-010-dark-theme-logo: Tema escuro antigo, toggle visível e logo legível

Kind: `mini`

## Problema
Após a SPEC-009, o Igor relatou três problemas:
1. O tema escuro grafite neutro não é o que ele quer; quer de volta o fundo
   escuro anterior (marrom quente de `06af66f`).
2. Não acha o botão de trocar para o tema claro. Verificado no navegador
   (1280×800, `next dev`): o indicador de desenvolvimento do Next
   (`#devtools-indicator`, 36×36, canto inferior esquerdo) fica exatamente sobre
   o `ThemeToggle` no fim do trilho; `elementFromPoint` no centro do toggle
   retorna o portal do Next. O problema já existia antes da SPEC-009 (o trilho
   e o toggle não mudaram) e só ocorre em desenvolvimento.
3. No escuro, a marca no trilho fica ilegível: o tile `.rail-logo` usa
   `--surface` escuro e a diagonal berinjela `#4e3d63` some no fundo.

## Resultado esperado
- Neutros do `[data-theme='dark']` voltam exatamente aos valores de `06af66f`
  (`--bg #1c1815` … `--text-4 #62564c`); tema claro da SPEC-009 intacto.
- Toggle de tema visível e clicável no trilho em `next dev`.
- Marca legível no escuro: tile creme atrás dela no trilho, no lockup de
  `/zetel` e no favicon.
- Contraste WCAG AA de `--text`/`--text-2` sobre `--bg`/`--surface`/
  `--reading-bg` mantido nos dois temas.

## Limites
- Fora: paleta da marca, geometria do logo, tema claro, `--partner-*`, `--p`,
  `--accent`, artefatos HTML autocontidos (regra 2), APIs, voz.
- Sem dependências ou fontes novas; nenhum log novo (regra 6).

## Verificacao
Contrato unitário atualizado (neutros escuros antigos, contraste AA, tile
creme no escuro, favicon sem tile escuro, `devIndicators: false`); gates FULL;
navegador: escuro e claro (`/zetel`, `/configuracoes`, tela de estudo) e mobile
375px, com screenshots; toggle alternado pelo próprio botão.

## Decisoes aprovaveis
- D1: restaurar os 13 neutros escuros de `06af66f`; sombras e demais tokens do
  escuro inalterados.
- D2: `devIndicators: false` em `next.config.ts` (escolhido pelo Igor). O
  overlay de erros do Next continua; exige reiniciar o `next dev`. Toggle,
  rótulo (`aria-label` "Usar tema claro/escuro") e tooltip não mudam.
- D3: tile creme (`--brand-creme`) atrás da marca no escuro (escolhido pelo
  Igor): `[data-theme='dark'] .rail-logo` usa creme; o lockup ganha um
  wrapper `.zetel-lockup-mark` que recebe tile creme só no escuro; no claro
  nada muda visualmente.
- D4: `app/icon.svg` perde a variante grafite: squircle creme com borda cinza
  quente em qualquer esquema do sistema.
