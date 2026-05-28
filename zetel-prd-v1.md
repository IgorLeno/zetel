# PRD v1 — Zetel

## Visão do produto

**Zetel** é um parceiro de estudos local-first para consumo profundo de conteúdos escritos, com foco em leitura guiada, conversa natural por texto e voz, geração assistida de notas e memória persistente integrada a um vault dedicado do Obsidian.[cite:44][cite:23][cite:88]

O produto foi concebido para transformar arquivos Markdown em uma experiência de estudo mais palatável e interativa, gerando um HTML paginado e bonito dentro do próprio aplicativo, enquanto preserva os materiais, notas e artefatos em arquivos locais Markdown no vault.[cite:93][cite:44]

## Objetivo do MVP

O MVP deve permitir que um único usuário, em ambiente local via navegador, crie um Zetel a partir de um ou mais arquivos Markdown, processe esse conteúdo, gere uma leitura em HTML paginado e converse com o parceiro de estudos sobre o conteúdo aberto na tela.[cite:44][cite:93]

A experiência central do MVP é: abrir um Zetel, ler a página atual, clicar em **Interagir**, conversar por texto ou voz sobre aquele conteúdo e, quando surgir algo relevante, sugerir e confirmar a criação de notas rápidas ou notas de literatura ligadas àquele Zetel.[cite:23][cite:27][cite:88]

## Não objetivos do MVP

Os seguintes itens ficam fora do escopo da primeira versão:

- Entrada nativa de PDF, HTML ou DOCX.
- Flashcards e repetição espaçada.
- Clonagem de voz.
- Edição automática de notas antigas sem confirmação.
- Visão computacional do conteúdo na tela.
- Sistema de tarefas e produtividade.
- Aba dedicada de conversas.
- Tags e backlinks automáticos nas notas.
- Aplicativo desktop com Electron ou Tauri.

Esses pontos podem entrar em fases posteriores, mas não devem aumentar a complexidade do primeiro ciclo de implementação.[cite:1][cite:5]

## Usuário-alvo

O usuário inicial é único e utiliza o sistema como ferramenta pessoal de estudo, com interface em português brasileiro e execução local-first em seu próprio computador.[cite:3][cite:5]

O caso de uso principal é leitura profunda de livros, papers e materiais técnicos, com produção simultânea de entendimento, notas de estudo e refinamento progressivo da personalidade do parceiro de estudos.[cite:2][cite:5]

## Proposta de valor

O Zetel não é apenas um leitor nem apenas um chatbot. Ele é um ambiente de estudo persistente onde cada conteúdo vira um espaço próprio de leitura, conversa e produção de notas, enquanto o parceiro de estudos mantém memória global e adapta seu comportamento pelas interações acumuladas.[cite:5][cite:44]

A proposta central é combinar quatro coisas em um mesmo sistema:

- consumo agradável de conteúdo escrito;
- diálogo multimodal natural;
- geração de conhecimento em Markdown no vault;
- memória local e auditável do parceiro.[cite:44][cite:23][cite:88]

## Princípios de produto

- **Local-first**: o app roda via localhost e armazena conhecimento e artefatos localmente.[cite:44]
- **Cooperação, não automação cega**: notas e mudanças relevantes devem ser propostas e confirmadas junto com o usuário.[cite:5]
- **Personalidade emergente**: o parceiro começa neutro e evolui por memória e interação, sem perfil rígido pré-configurado.[cite:5]
- **Conhecimento legível por humanos**: memória explícita, notas e prompts relevantes devem existir em Markdown editável.[cite:44][cite:93]
- **Multimodalidade prática**: texto e voz devem coexistir como modos independentes de entrada e saída.[cite:23][cite:27][cite:88]

## Arquitetura de informação

### Menu principal

O menu principal do MVP terá três áreas:

- **Zetel**
- **Memória**
- **Configurações**

As notas não aparecem como item global do menu principal porque pertencem a cada Zetel específico, enquanto a memória do parceiro é transversal a todos os Zetels.[cite:5]

### Estrutura interna de um Zetel

Ao abrir um Zetel específico, o aplicativo deve exibir as seguintes seções internas:

- **Leitura**
- **Arquivos**
- **Notas rápidas**
- **Notas de literatura**
- **Artefatos**

A aba **Leitura** abre o HTML paginado na área principal. **Arquivos** mostra os Markdown originais usados na geração. **Notas rápidas** e **Notas de literatura** armazenam os materiais produzidos ao longo das interações. **Artefatos** guarda, no MVP, o HTML gerado e outros arquivos de saída relacionados ao Zetel.[cite:44][cite:93]

## Conceito de Zetel

Um Zetel é uma unidade persistente de estudo associada a um conteúdo ou conjunto de conteúdos correlatos. Ele não representa uma única sessão de chat; representa um espaço contínuo de leitura, interpretação e produção de notas sobre um tema específico.[cite:5]

Um Zetel pode reunir um ou mais arquivos Markdown. Esses arquivos são preservados individualmente na área de Arquivos, mas seu conteúdo é combinado em um único fluxo de leitura, que gera um único HTML com navegação interna por páginas.[cite:93][cite:44]

## Fluxo principal do usuário

### 1. Estado vazio inicial

Quando o aplicativo abre sem nenhum Zetel criado, a tela principal deve mostrar um estado vazio elegante com um botão **Criar Zetel**. Essa tela deve comunicar clareza, simplicidade e foco, sem ruído visual desnecessário.[cite:2]

### 2. Criação de Zetel

Ao clicar em **Criar Zetel**, o usuário informa manualmente o nome inicial do Zetel e pode adicionar um ou mais arquivos Markdown por seleção de arquivo ou por drag-and-drop.[cite:2]

Neste primeiro momento, apenas arquivos `.md` são aceitos. Cada arquivo deve ser copiado para a pasta do Zetel dentro do vault e permanecer acessível individualmente na seção **Arquivos**.[cite:93][cite:44]

### 3. Processamento

Após adicionar os arquivos, o app habilita o botão **Processar**. O processamento deve ler os Markdown, consolidar o conteúdo em ordem definida pelo fluxo de ingestão e preparar a estrutura intermediária necessária para a renderização paginada.[cite:93]

### 4. Preparar leitura

Depois do processamento, o app habilita o botão **Preparar leitura**. Essa etapa deve gerar um único arquivo HTML com navegação interna por páginas, visual híbrido entre artigo e apresentação, e renderização dentro do próprio programa.[cite:44]

O HTML gerado deve ser salvo no vault do Obsidian, dentro da pasta de artefatos do Zetel, para garantir persistência local e fácil inspeção pelo usuário.[cite:44][cite:82]

### 5. Estudo e interação

Ao abrir um Zetel, a aba **Leitura** deve exibir a primeira página do HTML gerado. A navegação deve combinar setas de anterior/próxima e mini índice lateral para permitir leitura sequencial e navegação estrutural.[cite:2]

A leitura serve como ponto de partida da conversa, mas o diálogo pode atravessar páginas e blocos diferentes do mesmo conteúdo para estabelecer conexões e retomadas conceituais.[cite:5]

## Interface da leitura

A tela de leitura do Zetel deve ter três regiões principais:

- barra lateral esquerda com o menu principal e a navegação interna do Zetel;
- área central com a página HTML renderizada;
- painel recolhível de interação com o parceiro.

Na experiência de leitura, o painel de interação deve permanecer acessível, mas não dominante. O foco visual principal é o conteúdo.[cite:2]

### Controles de interação

Na aba **Leitura**, o painel de interação deve incluir:

- botão **Interagir**;
- seção **Você** com modo texto ou voz;
- seção **Parceiro** com modo texto ou voz;
- botão de mute do microfone do usuário;
- botão de pausa da fala do parceiro;
- transcrição visível da fala do usuário e da resposta do parceiro.[cite:23][cite:27][cite:88]

O parceiro deve sempre esperar a iniciativa do usuário. Ao clicar em **Interagir**, ele deve começar com uma saudação neutra e contextual, convidando o usuário a dizer o que deseja entender, discutir ou explorar sobre a página ou tema em questão.[cite:5]

## Comportamento do parceiro

O parceiro de estudos começa com personalidade neutra e não depende de presets pedagógicos no menu. O tom, o grau de criticidade, o estilo de explicação e a forma de discordar devem emergir progressivamente das interações e ser registrados como memória observada pelo sistema.[cite:5]

Ele deve ser capaz de:

- explicar conceitos;
- fazer perguntas;
- apontar desalinhamentos conceituais;
- retomar trechos anteriores;
- sugerir notas a partir da conversa;
- responder em texto, voz ou ambos, conforme os modos escolhidos.[cite:23][cite:88]

## Uso de fontes externas

O app deve ter um botão para ligar ou desligar acesso à internet. Quando o modo internet estiver desligado, o parceiro não deve buscar nada fora do material e da memória local. Quando estiver ligado, ele ainda deve pedir confirmação antes de usar fontes externas.[cite:23][cite:97]

Se uma resposta depender de informação externa, toda a resposta deve aparecer com estilo visual diferenciado e com selo **fonte externa**, usando uma cor distinta, como azul escuro, para deixar clara a origem expandida do conteúdo.[cite:2]

## Notas

O parceiro não cria notas de forma automática e silenciosa. Quando identificar uma formulação relevante, ele deve sugerir a criação da nota e abrir um fluxo de confirmação cooperativo.[cite:5]

As ações disponíveis para uma nota sugerida devem ser:

- **Guardar nota**
- **Editar nota**
- **Discutir nota**
- **Rejeitar nota**

No MVP, o sistema deve suportar dois tipos de nota por Zetel:

- **Notas rápidas**
- **Notas de literatura**

Notas de literatura começam vazias e vão sendo geradas ao longo das interações. Tags, backlinks automáticos e notas permanentes ficam para fases posteriores.[cite:5]

## Memória do parceiro

A memória do parceiro é global e compartilhada entre todos os Zetels. Ela deve registrar preferências emergentes observadas pelo sistema, padrões úteis de interação, histórico consolidado relevante e outros elementos que melhorem a parceria de estudo ao longo do tempo.[cite:5]

No MVP, essa memória deve ser representada como notas Markdown editáveis pelo usuário. Isso preserva auditabilidade, autonomia e compatibilidade direta com a filosofia de armazenamento local do Obsidian.[cite:44][cite:79]

A recomendação de arquitetura é híbrida:

- Markdown no vault para memória explícita, notas, prompts e artefatos humanos.
- SQLite local para metadados, índice, estado de sessão, cache de modelos e outros dados operacionais.[cite:44][cite:40]

## Estrutura recomendada do vault

```text
vault/
  zetels/
    nome-do-zetel/
      arquivos/
        fonte-1.md
        fonte-2.md
      notas-rapidas/
      notas-literatura/
      artefatos/
        leitura.html
      attachments/
      images/
  parceiro/
    memoria/
    perfil-emergente/
  config/
    prompts/
  sistema/
```

Essa estrutura separa bem o conhecimento específico de cada Zetel da memória global do parceiro e dos arquivos de configuração do sistema.[cite:44][cite:82]

## Configurações

O menu **Configurações** deve conter, no MVP, as seguintes seções:

- **OpenRouter**
- **Modelos**
- **Voz**
- **Interface**
- **Internet**
- **Prompts**
- **Desenvolvimento avançado**

### OpenRouter

A seção OpenRouter deve permitir inserir a API key, testar conexão e manter os dados necessários para chamadas de modelos centralizadas no app. O OpenRouter expõe um catálogo unificado de modelos e endpoints dedicados para fala e transcrição, o que simplifica a integração inicial do Zetel.[cite:53][cite:23][cite:94]

### Modelos

A seção Modelos deve permitir escolher separadamente:

- modelo de chat;
- modelo de STT;
- modelo de TTS.

Ao lado da seleção, o app deve exibir preço conhecido, e oferecer botão **Atualizar** para buscar novamente valores e propriedades de modelos a partir do catálogo do OpenRouter.[cite:25][cite:26][cite:53]

### Voz

A seção Voz deve permitir salvar vozes favoritas, idioma, opções de teste e preferências de saída do parceiro. No MVP, a prioridade é equilíbrio entre naturalidade e baixo custo, não clonagem de voz.[cite:20][cite:29][cite:78]

### Interface

A interface do MVP deve estar em português brasileiro. Também deve permitir tema visual e ajustes simples de apresentação.[cite:2]

### Internet

Essa seção deve refletir a mesma lógica do botão de acesso externo disponível na experiência de leitura, permitindo ligar ou desligar o uso de fontes externas.[cite:23][cite:97]

### Prompts

Os prompts editáveis devem aparecer como texto livre bruto, e não em estrutura complexa. No MVP, convém separar pelo menos:

- prompt de leitura de Markdown;
- prompt de paginação/renderização;
- prompt do parceiro de estudos;
- prompt de sugestão de notas;
- prompt de uso de fontes externas.[cite:1]

## Estratégia inicial de modelos

A estratégia inicial deve usar OpenRouter como camada de integração unificada para chat, TTS e STT. Isso permite trocar modelos sem reescrever a arquitetura central e aproveitar endpoints unificados para áudio e texto.[cite:23][cite:27][cite:88]

Sugestão inicial de trilha de testes:

| Função | Opção inicial | Opção de comparação | Observação |
|---|---|---|---|
| Chat | Modelo textual de boa qualidade e custo moderado | Alternativa mais barata | Definir na fase técnica. |
| STT | GPT-4o Mini Transcribe ou similar[cite:99] | Outra opção do catálogo STT[cite:88] | Prioridade para boa transcrição em PT-BR. |
| TTS | GPT-4o Mini TTS[cite:29] | Gemini 3.1 Flash TTS Preview[cite:78] | Comparar naturalidade e custo. |

O objetivo do MVP não é ser model-agnostic em excesso, mas ter flexibilidade suficiente para testar combinações sem refatoração estrutural precoce.[cite:23][cite:53]

## Exclusão e lixeira

Ao excluir um Zetel, ele não deve ser removido permanentemente de imediato. Deve ir primeiro para uma lixeira interna do sistema.[cite:2]

Somente quando o usuário excluir o Zetel da lixeira interna é que todos os seus arquivos, notas e artefatos associados devem ser apagados definitivamente.[cite:2]

## Decisões de UX do MVP

- Tela inicial vazia e elegante com botão **Criar Zetel**.
- Visual do HTML híbrido entre artigo e apresentação.
- Painel de interação recolhível.
- Navegação por setas e mini índice lateral.
- Respostas com fonte externa destacadas visualmente e com selo específico.
- Criação de notas sempre cooperativa e confirmada.[cite:2]

## Requisitos funcionais

### RF-01 — Criar Zetel
O sistema deve permitir criar um Zetel com nome definido manualmente pelo usuário e um ou mais arquivos Markdown associados.[cite:93]

### RF-02 — Armazenar arquivos do Zetel
O sistema deve copiar os arquivos Markdown enviados para a pasta do Zetel no vault local.[cite:44]

### RF-03 — Processar conteúdo
O sistema deve consolidar um ou mais arquivos Markdown em um único fluxo lógico para leitura.[cite:93]

### RF-04 — Preparar leitura
O sistema deve gerar um único arquivo HTML com navegação interna por páginas e armazená-lo na pasta de artefatos do Zetel.[cite:44]

### RF-05 — Abrir leitura
O sistema deve abrir a primeira página do HTML gerado na aba Leitura do Zetel.[cite:2]

### RF-06 — Interação multimodal
O sistema deve permitir combinações independentes de entrada e saída em texto e voz para usuário e parceiro.[cite:23][cite:49][cite:88]

### RF-07 — Transcrição
O sistema deve transcrever a fala do usuário e a saída do parceiro durante interações por voz.[cite:88][cite:49]

### RF-08 — Sugerir notas
O sistema deve sugerir criação de notas rápidas ou notas de literatura e solicitar confirmação antes de salvar.[cite:5]

### RF-09 — Memória editável
O sistema deve disponibilizar a memória do parceiro como notas Markdown editáveis.[cite:44][cite:79]

### RF-10 — Controle de internet
O sistema deve permitir bloquear ou autorizar uso de fontes externas e pedir confirmação antes de usá-las.[cite:23][cite:97]

### RF-11 — Atualizar modelos
O sistema deve permitir consultar e atualizar lista de modelos e preços conhecidos do OpenRouter.[cite:25][cite:26][cite:56]

### RF-12 — Renomear e excluir Zetel
O sistema deve permitir renomear Zetels, enviá-los para lixeira interna e removê-los definitivamente a partir dessa lixeira.[cite:2]

## Requisitos não funcionais

- O app deve funcionar localmente via navegador, em localhost.
- O app deve ser pensado para usuário único no MVP.
- O conhecimento do usuário deve permanecer local e auditável.
- A experiência deve ser visualmente agradável e focada em leitura profunda.
- O sistema deve ser modular o suficiente para futuras extensões com PDF, visão computacional e tarefas.
- O sistema deve favorecer simplicidade inicial em vez de excesso de configurações.[cite:44][cite:23]

## Arquitetura técnica sugerida

### Stack

Sugestão para o MVP:

- **Frontend**: Next.js + React.
- **Backend**: rotas do próprio Next.js no início.
- **Persistência operacional**: SQLite local.
- **Persistência de conhecimento**: arquivos Markdown e HTML no vault do Obsidian.
- **Integração de IA**: OpenRouter para chat, TTS e STT.[cite:23][cite:44][cite:53]

Essa escolha reduz complexidade, favorece iteração rápida e mantém o produto coerente com o princípio local-first.[cite:44]

## Roadmap de implementação

### Etapa 1 — Estrutura base

- criar o projeto web local-first;
- definir a estrutura do vault;
- implementar menu principal;
- implementar estado vazio inicial;
- implementar criação, listagem, renomeação e lixeira de Zetels.

### Etapa 2 — Ingestão de Markdown

- upload e drag-and-drop de múltiplos `.md`;
- cópia para a pasta do Zetel;
- processamento do conteúdo unificado;
- armazenamento dos arquivos-fonte.

### Etapa 3 — Preparar leitura

- pipeline Markdown → HTML;
- paginação interna;
- visual híbrido entre artigo e apresentação;
- abertura da aba Leitura com índice lateral e setas.

### Etapa 4 — Interação multimodal

- painel recolhível de interação;
- modos texto/voz independentes;
- integração inicial com chat e transcrição;
- botão Interagir;
- mute e pausa.

### Etapa 5 — Notas cooperativas

- sugestão de notas;
- fluxo Guardar / Editar / Discutir / Rejeitar;
- gravação em notas rápidas e notas de literatura.

### Etapa 6 — Memória do parceiro

- estrutura de memória em Markdown;
- observações emergentes;
- visualização e edição pelo usuário.

### Etapa 7 — Configurações avançadas

- API key OpenRouter;
- seleção de modelos;
- preços conhecidos e atualização;
- vozes salvas;
- prompts editáveis.

## Riscos e atenção

- A qualidade percebida do produto dependerá fortemente da naturalidade do TTS e da qualidade do texto intermediário enviado ao sintetizador.[cite:20][cite:78]
- A renderização de HTML “bonito” a partir de Markdown precisa equilibrar legibilidade com leveza visual, sem virar um slide deck engessado.[cite:2]
- A memória do parceiro precisa ser útil sem se tornar inchada ou confusa; por isso, a separação entre Markdown humano e SQLite operacional é importante.[cite:40][cite:44]
- O uso de múltiplos modos de áudio e texto exige uma UI clara para evitar ambiguidade na interação.[cite:49][cite:88]

## Decisões para fases futuras

Itens já antecipados, mas fora do MVP:

- suporte nativo a PDF;
- visão computacional para screenshots e conteúdo visual;
- notas permanentes como fluxo maduro;
- tags e backlinks automáticos;
- tarefas e planejamento de estudo;
- repetição espaçada;
- app desktop empacotado;
- mais automações sobre MOCs e estrutura zettelkasten.[cite:5][cite:97]
