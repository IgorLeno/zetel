# SPEC-011-dark-logo-colors: Cores da marca no tema escuro

Kind: `mini`

## Problema
A SPEC-010 colocou um tile creme atrás da marca no escuro. O Igor achou o
resultado ruim: no fundo escuro o bloco claro parece colado por cima, com
efeito de sobreposição. A marca precisa funcionar direto sobre o fundo escuro,
sem tile, com conforto visual nos dois temas.

## Resultado esperado
- Sem tile creme no escuro (trilho e lockup de `/zetel`); o `.rail-logo` volta
  a usar `--surface`.
- No escuro, a marca usa uma variante de cor (opção B, escolhida pelo Igor):
  balão de cima `#e3b39c`, balão de baixo `#b6aadb`, diagonal `#8c79ab`,
  linhas `#4e3d63`. No claro, as cores da SPEC-009 não mudam.
- Diagonal com contraste ≥ 3:1 (objeto gráfico, WCAG 1.4.11) sobre `--bg` e
  `--surface` do escuro (4.57 e 4.07); linhas ≥ 3:1 sobre os dois balões.
- Favicon: squircle creme no esquema claro; no escuro, squircle `#28221e` com
  a mesma variante de cor.

## Limites
- Fora: tema claro, neutros do escuro (SPEC-010), geometria da marca,
  `devIndicators`, `--partner-*`, `--p`, `--accent`, artefatos HTML (regra 2).
- Sem dependências ou fontes novas; nenhum log novo (regra 6).

## Verificacao
Contratos unitários atualizados (sem tile creme, variante escura com
contraste calculado, favicon claro/escuro); gates FULL; navegador: escuro e
claro em `/zetel`, `/configuracoes` e mobile 375px, com screenshots.

## Decisoes aprovaveis
- D1: `ZetelMark` ganha classes por elemento (`zm-top`, `zm-bottom`,
  `zm-diag`, `zm-lines`) e mantém os `fill`/`stroke` da marca como
  atributos; `[data-theme='dark'] .zetel-mark .zm-*` sobrescreve por CSS.
- D2: remover a regra de tile creme do `.rail-logo` e o wrapper
  `.zetel-lockup-mark` criados na SPEC-010.
- D3: `app/icon.svg` volta a ter `@media (prefers-color-scheme: dark)` com
  tile `#28221e` e as cores da variante escura.
