# Zetel

Zetel é um parceiro de estudos local-first para trabalhar com materiais em Markdown, conversar sobre o conteúdo e transformar fontes de estudo em artefatos estruturados.

O projeto combina uma aplicação web em Next.js com armazenamento local, processamento de documentos e recursos de IA. O conteúdo original permanece em um vault Markdown; o SQLite é usado para estado operacional, indexação e histórico da aplicação.

A ideia central é manter o material de estudo sob controle do usuário e usar modelos de linguagem como uma camada de apoio, não como fonte de verdade.

## O que o Zetel faz

Um Zetel funciona como uma unidade de estudo que reúne arquivos, leitura, conversa, notas e artefatos derivados.

Atualmente o projeto permite:

- criar e organizar Zetels a partir de um vault local;
- importar e processar arquivos Markdown;
- segmentar o conteúdo preservando referências e hashes de origem;
- gerar uma versão de leitura em HTML;
- gerar guias de estudo com apoio de modelos de linguagem;
- conversar com o conteúdo de cada Zetel;
- manter notas e memória global em Markdown;
- relacionar respostas do chat ao trecho que está sendo lido;
- usar interação por voz em modo mãos-livres;
- configurar modelos e parâmetros do OpenRouter pela aplicação.

## Local-first

O vault é a fonte durável do conteúdo.

```text
<vault>/
├── zetels/
│   └── <slug>/
│       ├── arquivos/
│       ├── notas-rapidas/
│       ├── notas-literatura/
│       ├── artefatos/
│       └── images/
├── parceiro/
│   └── memoria/
└── config/
    └── prompts/
