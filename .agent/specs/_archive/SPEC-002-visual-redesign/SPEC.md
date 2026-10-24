# SPEC-002-visual-redesign: Redesign visual aconchegante com parceiro vivo

Kind: `mini`

## Problema
A interface atual parece um dashboard empresarial: abas densas, painéis
quadrados, pouca personalidade. O uso é confuso e o parceiro de estudos não
tem presença visual, embora o produto (PRODUCT_VISION) tenha a conversa como
núcleo.

## Resultado esperado
Visual aconchegante (creme/pêssego/lavanda, cantos arredondados, sombras
macias, Fraunces + Nunito, leitura em Literata), com:
- avatar vivo (orb) por personalidade, com estados calmo/ouvindo/pensando/falando;
- cor própria por personalidade (built-ins fixas; perfis do usuário com cor
  escolhida e persistida);
- tela de estudo com a conversa no centro, material em painel lateral
  recolhível e arquivos/notas/artefatos em gaveta;
- trilho lateral fino; Início, Memória e Configurações no mesmo estilo;
- botões de ação da conversa funcionais (sugestões, ouvir, virar nota,
  reexplicar) usando capacidades já existentes.

Referência aprovada: mockup navegável apresentado em 2026-09-29.

## Limites
Fora: streak/dias seguidos, quiz interativo inline, saudação com memória de
"onde paramos", correção do 429 do OpenRouter, mudanças no prompt do tutor.
Invariantes do CLAUDE.md preservadas (iframe sandbox sem same-origin, app não
injeta CSS no artefato, streams do chat não são desmontados).

## Verificacao
typecheck, test:ci, build, coverage (FULL por migração de banco),
`git diff --check` e smoke visual no navegador (claro/escuro, estreito/largo).

## Decisoes aprovaveis
- Direção visual e layout conversa-no-centro: aprovados pelo usuário.
- Cor por personalidade persistida em `tutor_profiles` (migração aditiva): aprovado.
- Contratos de design-system (module-14-2/14-3) reescritos para os novos tokens.
