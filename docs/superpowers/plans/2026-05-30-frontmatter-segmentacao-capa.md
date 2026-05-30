# Correção — Frontmatter Não Deve Virar Página de Leitura

- [x] Reproduzir que frontmatter YAML antes do primeiro H1 vira página `[sem título]`.
- [x] Corrigir a árvore MDAST antes da segmentação para remover frontmatter inicial.
- [x] Manter paridade entre `processZetel` e `renderZetel`.
- [x] Confirmar que a primeira página com H1 isolado continua detectada como capa.
- [x] Não alterar schema SQLite, contratos de API nem estrutura de `TocEntry`.
- [x] Rodar smoke focado e `pnpm build`.

Outcome: `pnpm build` passou limpo. Smoke end-to-end em HOME/vault temporários confirmou HTML sem `[sem título]`, com `page cover` e sem frontmatter bruto renderizado.
