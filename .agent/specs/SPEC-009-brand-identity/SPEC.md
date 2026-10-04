# SPEC-009-brand-identity: Nova identidade visual — logo e paleta

Kind: `mini`

## Problema
O Zetel não tem marca: o trilho mostra um "z" em texto sobre gradiente, não há
favicon/ícone do app e os neutros (creme amarronzado, texto marrom) não seguem
a identidade aprovada pelo Igor (brand board: "Z" formado por dois balões em
paralelogramo — pêssego em cima, lavanda embaixo — ligados por diagonal
berinjela; wordmark serifado grafite; tagline "parceiro de estudos").

## Resultado esperado
- Ícone recriado como SVG vetorial (sem usar o raster de referência) e
  componente de logo com duas formas: marca isolada e lockup horizontal
  (marca + "Zetel" + tagline "parceiro de estudos").
- O "z" do trilho vira a marca; favicon/ícone do app (`app/icon.svg`) com
  variante clara (squircle creme) e escura (squircle grafite).
- Tokens de marca em `app/globals.css` (Creme `#FAF7F2`, Grafite `#2E2E33`,
  Pêssego `#F7C9B3`, Lavanda `#CEC4F0`, Cinza Quente `#D9D4CC`, Berinjela
  `#4E3D63`) e neutros dos temas claro e escuro derivados dessa paleta.
- Contraste WCAG AA: `--text` e `--text-2` ≥ 4.5:1 sobre `--bg` e `--surface`
  nos dois temas; `--text-3` não piora em relação ao atual. Pêssego e lavanda
  só como fundo/acento, nunca como cor de texto.

## Limites
- Fora: cores dos parceiros (`--partner-*`), `--p`/`--accent` e derivados
  (continuam vindo do parceiro ativo), artefatos HTML autocontidos (regra 2),
  layout/textos das telas, voz, rotas de API.
- Sem fonte nova e sem dependências novas.
- Nenhum log novo (regra 6).

## Verificacao
Contrato unitário (tokens nos dois temas, contraste AA calculado dos hex,
ícone SVG sem referências externas, trilho usando a marca); gates FULL;
navegador: claro, escuro e mobile com screenshots.

## Decisoes aprovaveis
- D1: `components/ZetelLogo.tsx` com `ZetelMark` (SVG inline, cores fixas da
  marca, decorativo quando dentro de link rotulado) e `ZetelLockup` (marca +
  wordmark). O SVG define `fill`/`stroke` em cada elemento para não herdar a
  regra global `svg { stroke: currentColor; fill: none }`.
- D2: wordmark em texto com Fraunces (`--font-display`, já carregada) peso 600
  e tagline em Nunito (`--font-ui`) com letter-spacing largo — Fraunces cobre a
  serifa editorial de alto contraste; nenhuma fonte nova. O lockup aparece no
  topo da tela inicial (`/zetel`), acima da saudação.
- D3: `app/icon.svg` (convenção de arquivo do Next) é autocontido, com
  `@media (prefers-color-scheme: dark)` interno trocando o squircle creme pelo
  grafite. O favicon segue o esquema do sistema/navegador, não o cookie
  `zetel-theme` (o navegador não envia cookie ao decidir o favicon). Sem PNG/
  apple-icon nesta entrega.
- D4: tokens `--brand-*` no `:root`; neutros (`--bg*`, `--surface*`, `--hover`,
  `--border*`, `--text*`, sombras) recalibrados para creme/grafite no claro e
  grafite no escuro. `--partner-*`, `--p*` e `--accent*` intactos; o brilho de
  fundo (`.app-glow`) passa a usar pêssego/lavanda da marca.
