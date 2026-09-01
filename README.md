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
```

Arquivos originais, notas e memória permanecem em Markdown e podem ser versionados ou copiados independentemente da aplicação.

O estado operacional fica separado:

```text
~/.zetel/
├── zetel.db
└── config
```

O SQLite mantém informações de execução, indexação e histórico. A chave do OpenRouter é armazenada fora do banco, do vault e do Git.

## Arquitetura

O projeto usa Next.js tanto para a interface quanto para as rotas backend.

```text
                    ┌─────────────────────┐
                    │     Next.js UI      │
                    │ React / TypeScript  │
                    └──────────┬──────────┘
                               │
                     Next.js API Routes
                               │
        ┌──────────────────────┼─────────────────────┐
        │                      │                     │
        ▼                      ▼                     ▼
   SQLite local          Vault Markdown        OpenRouter
  estado operacional    fonte de verdade          LLMs
        │                      │                     │
        └──────────────┬───────┴─────────────┬──────┘
                       │                     │
                       ▼                     ▼
                  processamento         chat / geração
                    de fontes             de conteúdo
```

### Persistência

O projeto separa conteúdo permanente de estado interno.

**Vault Markdown**

Mantém:

- arquivos de estudo;
- notas;
- memórias;
- prompts;
- artefatos associados ao Zetel.

**SQLite**

Mantém:

- Zetels cadastrados;
- páginas processadas;
- índices;
- histórico de chat;
- configurações operacionais;
- metadados necessários para a aplicação.

Essa divisão permite que o conteúdo principal continue legível e utilizável fora do próprio Zetel.

## Pipelines de leitura

O projeto possui dois caminhos diferentes para transformar os materiais de origem.

### Documento Técnico

O Documento Técnico é determinístico.

```text
Markdown
   ↓
remark / rehype
   ↓
sanitização
   ↓
HTML autocontido
```

Nenhum modelo de linguagem participa dessa etapa.

### Guia de Estudo

O Guia de Estudo usa IA, mas mantém a construção final sob controle da aplicação.

```text
Markdown
   ↓
segmentação
   ↓
catálogo de blocos + hashes
   ↓
OpenRouter
   ↓
JSON estruturado
   ↓
validação
   ↓
rastreabilidade server-side
   ↓
HTML determinístico
```

O modelo produz conteúdo estruturado, mas não escreve diretamente o HTML final.

As referências utilizadas pelo guia são conferidas contra o catálogo de fontes no servidor antes da geração do artefato.

O guia pode incluir elementos como:

- seções de estudo;
- comparações;
- tabelas;
- timelines;
- accordions;
- glossário;
- quiz interativo.

## Chat contextual

Cada Zetel possui seu próprio histórico de conversa.

O chat utiliza o conteúdo processado pelo servidor como contexto. Quando o usuário está em uma determinada página, a aplicação valida essa posição e busca o conteúdo correspondente no banco antes de montar a requisição para o modelo.

O texto enviado pelo navegador não é tratado como fonte autoritativa.

A comunicação das respostas utiliza streaming por SSE.

## Notas e memória

O Zetel mantém dois níveis de informação persistente.

### Notas

Associadas ao material que está sendo estudado.

### Memória global

Mantida no vault e disponibilizada ao parceiro de estudos durante as conversas.

A memória é lida diretamente do filesystem quando necessária, em vez de permanecer armazenada apenas em memória de processo.

Sugestões geradas pelo modelo não são salvas automaticamente. A criação, edição ou rejeição continua dependendo de uma ação explícita do usuário.

## Voz

O modo mãos-livres permite conversar com o Zetel utilizando reconhecimento de fala e reprodução automática das respostas.

A implementação utiliza a Web Speech API no cliente e mantém controles independentes para:

- microfone contínuo;
- reprodução automática da resposta.

## Stack

### Aplicação

- Next.js 15
- React 19
- TypeScript
- Node.js runtime
- SQLite / better-sqlite3

### Conteúdo

- Markdown
- remark
- rehype
- KaTeX
- highlight.js

### IA

- OpenRouter
- chat com streaming
- geração estruturada em JSON
- prompts configuráveis
- memória contextual
- geração de guias de estudo

### Qualidade

- Vitest
- Playwright
- V8 Coverage
- TypeScript type checking
- GitHub Actions

## Testes

A suíte é dividida em diferentes níveis.

```text
             E2E live
                 │
                E2E
                 │
            Integration
                 │
               Unit
```

### Unitários

Testam funções e regras de negócio sem acessar:

- OpenRouter real;
- vault real;
- banco local do usuário.

### Integração

Testam serviços completos utilizando:

- SQLite isolado;
- vault temporário;
- filesystem temporário;
- OpenRouter mockado.

### E2E

Os testes E2E usam Playwright para validar o comportamento da aplicação pelo navegador.

Existe também uma suíte E2E live, opt-in, que executa fluxos reais com OpenRouter em um ambiente temporário isolado.

## Executando o projeto

### Pré-requisitos

- Node.js
- pnpm

Clone o repositório:

```bash
git clone https://github.com/IgorLeno/zetel.git
cd zetel
```

Instale as dependências:

```bash
pnpm install
```

Inicie o ambiente de desenvolvimento:

```bash
pnpm dev
```

Depois, acesse a aplicação no navegador e configure:

1. o caminho do vault;
2. a integração com OpenRouter;
3. os modelos que serão utilizados.

## Validação

Executar todos os testes unitários e de integração:

```bash
pnpm test
```

Separadamente:

```bash
pnpm test:unit
pnpm test:integration
```

Coverage:

```bash
pnpm test:coverage
```

Type checking:

```bash
pnpm typecheck
```

Build:

```bash
pnpm build
```

E2E:

```bash
pnpm test:e2e
```

A suíte live com OpenRouter é executada separadamente e exige configuração explícita. Consulte [`docs/TESTING.md`](docs/TESTING.md).

## Backup

Como o conteúdo permanente fica no vault, ele pode ser versionado diretamente com Git ou copiado para outro local.

```bash
cd /caminho/do/vault
git init
git add .
git commit -m "backup"
```

Detalhes sobre o que deve ou não ser preservado estão em [`docs/BACKUP.md`](docs/BACKUP.md).

## Estrutura do repositório

```text
app/            aplicação e rotas Next.js
components/     componentes da interface
lib/            serviços, persistência e regras de negócio
tests/
├── unit/
└── integration/
e2e/            testes Playwright
docs/           documentação técnica
.agent/         contexto, arquitetura e workflow de desenvolvimento
```

## Princípios do projeto

Algumas decisões orientam a arquitetura do Zetel:

- conteúdo do usuário permanece local sempre que possível;
- Markdown é a fonte durável de conteúdo;
- modelos de linguagem não substituem fontes;
- geração por IA deve ser validável e rastreável;
- HTML derivado é gerado de forma determinística;
- sugestões de notas e memória exigem confirmação humana;
- segredos não são armazenados no vault ou no banco;
- testes padrão não fazem chamadas reais a modelos externos.

## Estado atual

O MVP textual está funcional e já inclui o fluxo principal de ingestão, leitura, chat, notas, memória, guias de estudo, rastreabilidade e interação por voz.

O projeto segue em desenvolvimento.
