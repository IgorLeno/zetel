# Zetel — PRD v2 Final, Plano Modular e Decisões Fundadoras

> Documento consolidado e aprovado. Todos os ajustes de consistência aplicados em 2026-05-28.
> Base de trabalho para a construção do Zetel por módulos pequenos e validados.
> Próximo passo operacional: **Módulo 0 — spikes A/B/C/D + mock visual**.

## Como ler este arquivo

Este documento contém quatro artefatos distintos, consolidados em arquivo único. Podem ser desmembrados em arquivos próprios quando o código crescer e conviver com eles exigir separação.

- **Parte A — PRD v2**: o produto recortado, já com as decisões fundadoras aplicadas e com os ajustes pedidos. Substitui o PRD v1.
- **Parte B — Plano Modular Revisado**: a sequência operacional de execução do MVP textual, com 9 módulos do MVP e mais 5 módulos pós-MVP. Substitui o plano modular anterior.
- **Parte C — Decisões Fundadoras D1–D15**: tabela de referência rápida sobre cada decisão crítica, marcando estado (definido / pendente de spike / fase futura).
- **Parte D — Novas inconsistências identificadas na revisão**: aponta sete pontos de fricção descobertos ao reescrever o PRD v2 e como cada um foi resolvido. Leitura obrigatória antes de iniciar qualquer módulo.

A análise crítica detalhada do PRD v1 que existia anteriormente neste arquivo foi sintetizada e absorvida nas decisões. Se for necessário recuperar, o PRD v1 original continua em `/home/ifernandes/Projetos/zetel/zetel-prd-v1.md`.

---

# Parte A — PRD v2 — Zetel

## Changelog v1 → v2

- **MVP recortado para texto puro.** Voz (TTS+STT) sai do MVP e passa a ser explicitamente Fase 2.
- **Pipeline de "Preparar leitura" definido como determinístico** (Markdown → HTML via `remark`/`rehype` + CSS). Sem LLM no caminho da geração de leitura no MVP.
- **Memória do parceiro só cooperativa.** O parceiro propõe; o usuário confirma. Sem observação silenciosa no MVP.
- **Modo internet sai do MVP.** Vira módulo pós-MVP com fluxo de confirmação e destaque visual.
- **Prompts editáveis em runtime saem do MVP.** No MVP os prompts ficam em arquivos versionados em `config/prompts/`.
- **Múltiplos arquivos por Zetel mantidos como visão do produto.** A arquitetura precisa suportar isso desde o início (modelo de dados, ordenação, regeneração). A UI pode entregar 1 arquivo no primeiro corte sem inviabilizar múltiplos.
- **Histórico de conversa por Zetel em SQLite.** Não em Markdown. Política de truncagem por orçamento de tokens.
- **Lixeira em pasta no vault** (`zetels/.lixeira/`), com flag em SQLite para listagem.
- **Mock visual estático precede a implementação** do HTML paginado.
- **Adicionadas seções "Modelo de dados" e "Contratos de API interna"**, antes ausentes.
- **Aba "Artefatos" recebe propósito explícito** (gestão dos arquivos gerados, não duplicação da leitura).
- **Comportamento do botão "Interagir" definido** (saudação só quando histórico vazio).
- **Definida regeneração do HTML quando arquivos mudam** ("Leitura desatualizada").
- **Fonte de verdade explicitada**: Markdown/notas são canônicos; SQLite é estado operacional; HTML é artefato regenerável.
- **Renomeação física da pasta do Zetel substituída por slug imutável + display name mutável** — elimina risco de não-atomicidade entre filesystem e SQLite.
- **Conteúdo textual da página persistido em `zetel_pages.content_text` + `content_hash`** — o chat usa o conteúdo armazenado como autoritativo, não o que o cliente envia.
- **Detecção de drift de arquivos editados externamente** via `content_hash`/`last_seen_mtime`/`size_bytes` em `zetel_files`.
- **Migrations versionadas** com tabela `schema_migrations`.
- **Política de logs sem conteúdo sensível** (sem texto de páginas, chat, notas ou chaves).
- **Política mínima para imagens em Markdown** — locais relativas são copiadas e reescritas; externas bloqueadas no MVP.
- **Rubrica mínima de quando o parceiro deve propor notas** — anti-ruído.
- **Contrato do chat reforçado**: servidor valida `page_id`, usa conteúdo armazenado, registra meta em `chat_messages`.

## 1. Visão do produto

**Zetel** é um parceiro de estudos local-first para consumo profundo de conteúdos escritos. Recebe arquivos Markdown, gera um HTML paginado dentro do app, e permite conversar com um parceiro alimentado por LLM sobre o material. Produz notas cooperativas e mantém memória global persistente — tudo em arquivos editáveis dentro de um vault dedicado do Obsidian.

O Zetel não é apenas leitor nem apenas chatbot. É um ambiente persistente onde cada conteúdo vira um espaço próprio de leitura, conversa e produção de notas.

## 2. Escopo do MVP (definitivo)

O MVP do Zetel é **textual**. Voz, internet, memória emergente automática e edição de prompts em runtime ficam **explicitamente fora** do primeiro corte.

O MVP entrega:

- CRUD de Zetels com lixeira.
- Ingestão de um ou mais arquivos `.md` por Zetel, com ordem explícita.
- Geração determinística de HTML paginado e armazenamento no vault.
- Leitura paginada com mini-índice e setas.
- Chat textual contextual à página atual.
- Notas cooperativas (rápidas e de literatura) com fluxo Guardar/Editar/Discutir/Rejeitar.
- Memória global do parceiro em Markdown, alimentada por sugestões cooperativas.
- Configurações: chave OpenRouter, seleção de modelo de chat, idioma e tema básico.

## 3. Não objetivos do MVP

- Entrada nativa de PDF, HTML ou DOCX.
- Voz: TTS de saída, STT de entrada, qualquer captura de microfone.
- Acesso à internet ou tool-use externo.
- Memória observada de forma automática ou silenciosa.
- Edição de prompts pela UI.
- Visão computacional, flashcards, repetição espaçada, tarefas.
- Tags ou backlinks automáticos.
- Editor de notas embutido. No MVP, edição é feita no Obsidian.
- App desktop empacotado (Electron/Tauri).
- Multi-usuário ou auth.

Esses pontos podem entrar em fases posteriores conforme a Parte B (Módulos 10–14).

## 4. Usuário-alvo

Único usuário, ferramenta pessoal, executada localmente em `localhost`. Interface em PT-BR. Caso de uso principal: leitura profunda de livros, papers e materiais técnicos com produção paralela de notas.

## 5. Princípios de produto

- **Local-first.** Conhecimento mora em Markdown no disco do usuário.
- **Cooperação, não automação cega.** Toda nota e toda memória passa por confirmação.
- **Personalidade emergente, mas auditável.** A "evolução" do parceiro vem de memórias confirmadas, não de observação silenciosa.
- **Conhecimento legível por humanos.** Markdown como fonte de verdade.
- **Simplicidade no MVP.** Prefere implementação clara e enxuta a flexibilidade especulativa.

## 6. Arquitetura de informação

### 6.1 Menu principal

Três áreas:

- **Zetel** — lista, criação e abertura de Zetels.
- **Memória** — visualização e revisão das memórias globais do parceiro.
- **Configurações** — chave, modelos, idioma, tema, lixeira.

### 6.2 Estrutura interna de um Zetel

Ao abrir um Zetel, há cinco abas internas:

- **Leitura** — exibe o HTML paginado. É a tela principal.
- **Arquivos** — lista dos `.md` originais, com ordem, opções de adicionar/remover e reordenar.
- **Notas rápidas** — lista das notas rápidas geradas para este Zetel.
- **Notas de literatura** — lista das notas de literatura geradas para este Zetel.
- **Artefatos** — exibe o HTML gerado como recurso: metadata (data de geração, tamanho), botões "Baixar HTML" e "Regenerar". Não duplica a experiência de leitura.

## 7. Conceito de Zetel

Um Zetel é uma unidade persistente de estudo associada a um conteúdo. Pode reunir um ou mais arquivos `.md` correlatos, escolhidos pelo usuário. Cada arquivo é preservado individualmente em `arquivos/`; o conteúdo é concatenado em ordem definida pelo usuário para gerar uma única leitura paginada.

A ordem dos arquivos é parte do estado persistente do Zetel (não derivada do nome). Ao adicionar, remover ou reordenar arquivos, o HTML existente fica marcado como **"Leitura desatualizada"** até o usuário acionar "Preparar leitura" novamente.

## 8. Fluxo principal

### 8.1 Estado vazio inicial

Tela limpa com botão **Criar Zetel** e link discreto para **Configurações** (necessário antes do primeiro chat funcionar — sem chave OpenRouter, o chat estará indisponível).

### 8.2 Criação de Zetel

Modal: nome (manual) + seleção opcional inicial de arquivos `.md` (drag-and-drop ou file picker). Apenas extensão `.md`. Cada arquivo é copiado para `zetels/<slug>/arquivos/`.

### 8.3 Arquivos

Na aba Arquivos:

- Lista dos `.md` com nome, tamanho, data e botão de remover.
- Drag-to-reorder define ordem de concatenação.
- Botão **Adicionar arquivos** permite anexar novos `.md` a qualquer momento.
- Qualquer mudança marca o estado interno do Zetel como "leitura desatualizada".

### 8.4 Processar e preparar leitura

Dois passos sequenciais e determinísticos:

- **Processar** — lê os arquivos na ordem definida, valida, gera uma estrutura intermediária (AST + índice de headings) e persiste em SQLite. Sem LLM.
- **Preparar leitura** — converte a estrutura em um único HTML paginado, salva em `zetels/<slug>/artefatos/leitura.html`. Sem LLM.

Ambos são idempotentes: o mesmo input produz o mesmo output.

### 8.5 Leitura

A aba Leitura abre o `artefatos/leitura.html` em `<iframe sandbox>`. O HTML é **autocontido**: já sai do pipeline com CSS inline e referências de imagem resolvidas. O app não injeta CSS no iframe — apenas renderiza. Navegação por setas (anterior/próxima) e mini-índice lateral derivado dos headings do Markdown original (não dos quebras de página geradas).

### 8.6 Interação

Painel lateral recolhível. Botão **Interagir**:

- Abre o painel.
- Se o histórico do Zetel está **vazio**, o parceiro envia uma saudação contextual ("Estou na página X do Zetel Y. Sobre o que você gostaria de conversar?").
- Se o histórico **já existe**, o painel restaura a conversa anterior sem nova saudação.

O painel recolhido **não encerra a sessão**: ele apenas oculta. O estado de conversa permanece.

Input: somente texto no MVP. Sem botões de microfone, sem pausa, sem mute.

### 8.7 Contexto da página atual

O cliente envia, a cada turno do chat, o `page_id` (ou anchor canônico) da página corrente. O conteúdo da página pode ser enviado como otimização, mas o **servidor valida** o `page_id` contra `zetel_pages` e usa o `content_text` armazenado como fonte autoritativa do que injeta no prompt. Se o cliente enviar conteúdo divergente do `content_hash` armazenado, o servidor descarta o conteúdo do cliente e registra a divergência em `chat_messages.meta` (campos `page_id`, `page_anchor`, `page_hash_match: false`).

Se o `page_id` enviado não existir em `zetel_pages`, a chamada falha com 400 e o cliente é avisado para reprocessar o Zetel.

O servidor não mantém estado de "página corrente" entre turnos; a verdade vive no SQLite por turno.

A política inicial de contexto envia, em ordem: system prompt do parceiro + memória global truncada + últimos N turnos do histórico (truncado) + página validada (a partir do `content_text` armazenado). Páginas vizinhas só entram se o usuário pedir explicitamente. Orçamento total de tokens tem default conservador definido no Módulo 6.

## 9. Comportamento do parceiro

O parceiro:

- Explica conceitos, faz perguntas, aponta desalinhamentos, retoma trechos anteriores citados.
- Sugere notas e sugere entradas de memória, sempre cooperativamente.
- Responde sempre em **PT-BR por padrão**, independente do idioma do material.
- Não inicia conversa sem botão "Interagir" pressionado.
- Não acessa internet.
- Não modifica notas ou memória sem confirmação.

## 10. Notas cooperativas

Dois tipos por Zetel: **rápidas** e **de literatura**.

Quando o parceiro identifica formulação relevante, ele propõe uma nota dentro do chat com quatro ações:

- **Guardar** — salva direto no vault.
- **Editar** — abre campo de edição inline (texto bruto) antes de salvar.
- **Discutir** — devolve a sugestão como prompt para refinamento por **uma única rodada**. Após a rodada, o sistema apresenta a versão revisada com as mesmas quatro opções (sem "Discutir" novamente).
- **Rejeitar** — descarta sem salvar.

Notas salvas têm o esquema definido em §13.3.

### 10.1 Rubrica mínima de notas

O parceiro segue uma rubrica explícita ao decidir propor uma nota. A rubrica vive em `config/prompts/sugestao-nota.md` e o JSON estruturado inclui um campo interno `justificativa` (não exibido ao usuário) com o critério que motivou a sugestão.

**Notas rápidas** — insight pontual, definição precisa, conexão direta entre conceitos, ou citação relevante. Curtas (até 3 parágrafos). Critérios para propor:
- o usuário acabou de articular um entendimento próprio sobre o trecho;
- o conceito tem valor de retomada futura;
- ainda não há nota equivalente em `notas-rapidas/` deste Zetel.

**Notas de literatura** — síntese mais elaborada de um trecho ou conceito discutido. Estrutura: título, resumo curto, contexto de origem (página, citação curta). Critérios para propor:
- a conversa cobriu um trecho substantivo do material (mais do que uma frase pontual);
- o usuário sinalizou interesse profundo (perguntou várias vezes, pediu fixação, refrasou);
- a síntese agrega entendimento em relação ao próprio texto-fonte (não é cópia próxima).

**Anti-padrões — não propor nota para**: cumprimentos, perguntas triviais, conteúdo já presente em nota anterior do mesmo Zetel, reformulações próximas demais do texto-fonte.

A rubrica é parte do contrato do prompt e tem **frequência máxima implícita** (não propor mais de uma nota por turno; não propor em turnos consecutivos sem nova substância).

## 11. Memória do parceiro

Memória global é compartilhada entre todos os Zetels. No MVP é construída **manualmente + por sugestão cooperativa**, idêntico ao fluxo de notas. O parceiro propõe uma entrada de memória; o usuário confirma; vira arquivo Markdown em `parceiro/memoria/`.

O usuário pode editar diretamente no Obsidian. Caso edite enquanto o app está aberto, a próxima leitura da memória pelo backend reflete o novo conteúdo (estratégia: leitura sob demanda no início de cada turno do chat, não cache em memória do processo).

A memória é injetada no system prompt do parceiro, com truncagem por orçamento de tokens. Regras explícitas:
- a memória nunca consome mais que **40% do orçamento total de contexto por turno** (default no Módulo 8, revisável);
- entradas mais recentes ganham prioridade quando há corte;
- arquivos de memória maiores que um limite (definido no Módulo 8) ficam visíveis na UI da aba Memória com aviso "memória longa — considere consolidar", sem corte automático sem confirmação.

## 12. Configurações no MVP

Seções no MVP:

- **OpenRouter** — chave, botão "Testar conexão".
- **Modelos** — seleção do modelo de chat ativo, com preço por 1M tokens; botão "Atualizar" para refazer fetch do catálogo.
- **Interface** — tema (claro/escuro), idioma fixo PT-BR no MVP.
- **Vault** — path do vault (definido no primeiro uso, alterável).
- **Lixeira** — visualização da lixeira do vault, com opções de restaurar ou excluir definitivamente.

Seções **explicitamente fora do MVP**: Voz, Internet, Prompts editáveis, Desenvolvimento avançado.

## 13. Modelo de dados (novo)

### 13.1 SQLite

Arquivo: `~/.zetel/zetel.db` (fora do vault, fora do código-fonte). Permissão `600`.

Tabelas mínimas:

| Tabela | Colunas principais |
|--------|-------------------|
| `schema_migrations` | `id INT PK`, `name TEXT UNIQUE`, `applied_at` |
| `settings` | `key TEXT PK`, `value TEXT`, `updated_at` |
| `zetels` | `id TEXT PK`, `slug TEXT UNIQUE` (imutável), `display_name TEXT` (mutável), `created_at`, `updated_at`, `trashed_at NULL`, `reading_stale BOOL`, `last_built_at NULL` |
| `zetel_files` | `id TEXT PK`, `zetel_id FK`, `filename TEXT`, `order_index INT`, `content_hash TEXT`, `size_bytes INT`, `last_seen_mtime INT`, `created_at`, `updated_at` |
| `zetel_pages` | `id INT PK`, `zetel_id FK`, `page_index INT`, `heading TEXT`, `anchor TEXT`, `content_text TEXT`, `content_hash TEXT`, `created_at` — com **`UNIQUE (zetel_id, anchor)`** declarado como constraint composta. |
| `chat_messages` | `id INT PK`, `zetel_id FK`, `role TEXT`, `content TEXT`, `created_at`, `meta JSON` |

`meta JSON` em `chat_messages` carrega: `page_id`, `page_anchor`, `page_hash_match BOOL`, `model`, `tokens_in`, `tokens_out`, e flags `suggested_note: true` / `suggested_memory: true` quando aplicável.

`content_hash` em `zetel_files` e `zetel_pages` é SHA-256 do conteúdo. Permite detecção de drift e idempotência de "Processar".

`anchor` em `zetel_pages` é único **dentro de cada Zetel** (constraint composta `UNIQUE (zetel_id, anchor)`) e é o que o cliente envia no chat — derivado dos headings do Markdown via slugify estável.

### 13.2 Estrutura do vault

```
vault/
  zetels/
    <slug>/
      arquivos/
        01-fonte.md
        02-fonte.md
      notas-rapidas/
      notas-literatura/
      artefatos/
        leitura.html
      attachments/
      images/
    .lixeira/
      <slug>-<timestamp>/
        (mesma estrutura acima)
  parceiro/
    memoria/
  config/
    prompts/
      parceiro.md
      sugestao-nota.md
      sugestao-memoria.md
  sistema/
```

### 13.3 Frontmatter padrão das notas

```yaml
---
zetel: <slug>
tipo: rapida | literatura
origem: chat
modelo: <id-do-modelo>
pagina_origem: <anchor ou null>
criada_em: <ISO 8601>
---
```

### 13.4 Frontmatter padrão das memórias

```yaml
---
escopo: global
origem: sugerida | manual
zetel_origem: <slug ou null>
modelo: <id-do-modelo ou null>
criada_em: <ISO 8601>
atualizada_em: <ISO 8601>
---
```

### 13.5 Fonte de verdade

Princípio explícito do sistema:

- **Fonte de verdade canônica** (sobrevive à perda do SQLite): arquivos Markdown no vault — `arquivos/`, `notas-rapidas/`, `notas-literatura/`, `parceiro/memoria/`, `config/prompts/`.
- **Estado operacional** (regenerável a partir dos canônicos + interação): SQLite (`zetel_pages.content_text`, `chat_messages`, `zetel_files.content_hash`, etc.).
- **Artefato regenerável** (descartável sem perda de conhecimento): `artefatos/leitura.html`.

Consequências operacionais:
- Apagar `~/.zetel/zetel.db` perde histórico de chat e índice de páginas, mas não perde notas nem memória.
- Apagar `artefatos/leitura.html` é seguro — basta clicar em "Atualizar leitura".
- O usuário pode versionar o vault em git (Markdown amigo de diff); o SQLite e o HTML ficam fora do controle de versão por padrão.

### 13.6 Migrations versionadas

Migrations vivem em arquivos numerados no código (não no vault): `migrations/001_init.sql`, `002_add_zetel_pages.sql`, etc. Cada arquivo é uma migration única, transacional e idempotente em sua aplicação.

Na inicialização, o app:
1. cria a tabela `schema_migrations` se não existe;
2. lista as migrations aplicadas;
3. aplica as faltantes em ordem, dentro de uma transação cada;
4. registra cada uma em `schema_migrations` ao final.

Falha em uma migration impede o app de subir e exibe a falha com instruções. No MVP não há down-migration automática (rollback é manual).

### 13.7 Renomeação de Zetel — slug imutável + display name mutável

Renomear um Zetel **não renomeia a pasta no filesystem** no MVP. Motivo: atomicidade entre SQLite, pasta no disco e referências de slug em frontmatter de notas é arriscada e não compensa a engenharia para um único usuário local.

Política:
- `slug` é definido na criação (derivado do nome inicial via slugify + sufixo numérico se colisão) e é **imutável**.
- `display_name` é livre e mutável a qualquer momento.
- A UI exibe `display_name`; o filesystem usa `slug`; o frontmatter de notas usa `slug`.
- "Renomear Zetel" altera apenas `display_name`.

Renomear a pasta física fica como feature pós-MVP, se justificada.

## 14. Contratos de API interna (novo)

Rotas internas do Next.js previstas para o MVP. Lista mínima, não exaustiva.

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/api/zetels` | Listar Zetels (com filtro de lixeira) |
| `POST` | `/api/zetels` | Criar Zetel |
| `PATCH` | `/api/zetels/:id` | Renomear |
| `DELETE` | `/api/zetels/:id` | Mover para lixeira |
| `POST` | `/api/zetels/:id/restore` | Restaurar da lixeira |
| `DELETE` | `/api/zetels/:id?purge=true` | Excluir definitivamente |
| `POST` | `/api/zetels/:id/files` | Adicionar arquivo |
| `DELETE` | `/api/zetels/:id/files/:fileId` | Remover arquivo |
| `PATCH` | `/api/zetels/:id/files/order` | Reordenar arquivos |
| `POST` | `/api/zetels/:id/process` | Processar (estrutura intermediária) |
| `POST` | `/api/zetels/:id/build-reading` | Gerar HTML paginado |
| `GET` | `/api/zetels/:id/chat` | Buscar histórico |
| `POST` | `/api/zetels/:id/chat` | Enviar mensagem (stream SSE de resposta) |
| `POST` | `/api/zetels/:id/notes` | Criar nota a partir de sugestão aceita |
| `GET` | `/api/memory` | Listar entradas de memória |
| `POST` | `/api/memory` | Criar entrada de memória a partir de sugestão aceita |
| `GET` | `/api/settings` | Ler settings |
| `PATCH` | `/api/settings` | Atualizar settings |
| `POST` | `/api/openrouter/test` | Testar chave |
| `GET` | `/api/openrouter/models` | Listar catálogo |

## 15. Requisitos funcionais (atualizado)

- **RF-01** Criar Zetel com nome manual e zero ou mais arquivos `.md` iniciais.
- **RF-02** Copiar arquivos para `zetels/<slug>/arquivos/`, preservando ordem definida pelo usuário.
- **RF-03** Processar arquivos em ordem em uma estrutura intermediária determinística.
- **RF-04** Gerar HTML paginado determinístico e salvar em `artefatos/leitura.html`.
- **RF-05** Abrir a leitura na primeira página com mini-índice e setas.
- **RF-06** Marcar leitura como desatualizada quando arquivos mudarem.
- **RF-07** Interagir em texto com o parceiro com contexto da página atual.
- **RF-08** Persistir histórico de conversa por Zetel em SQLite.
- **RF-09** Sugerir notas cooperativamente com fluxo Guardar/Editar/Discutir/Rejeitar (Discutir = 1 rodada).
- **RF-10** Sugerir entradas de memória cooperativamente, com mesmo fluxo.
- **RF-11** Salvar e editar memória como arquivos Markdown em `parceiro/memoria/`.
- **RF-12** Renomear o **display name** de um Zetel (slug físico imutável), mover para lixeira, restaurar e excluir definitivamente.
- **RF-13** Listar e selecionar modelo de chat do OpenRouter, exibindo preço por token.
- **RF-14** Detectar e refletir mudança externa em arquivos de memória.

## 16. Requisitos não funcionais

- Execução local em `localhost`, usuário único, sem auth.
- Persistência operacional em SQLite em `~/.zetel/zetel.db`.
- Persistência de conhecimento em Markdown no vault configurado; HTML é artefato regenerável.
- Chave OpenRouter armazenada em `~/.zetel/config` com permissão `600`. Não vai para SQLite, não vai para git.
- Renderização do HTML gerado dentro de `<iframe sandbox>`. O HTML é autocontido (CSS inline); o app não injeta estilos no iframe.
- Idioma da UI: PT-BR.
- Backend deve rodar em Node runtime (não Edge) por dependência de `better-sqlite3` e `fs`.

### 16.1 Logs

- Localização: `~/.zetel/logs/zetel.log` (rotacionado por tamanho — 5 MB, mantém 3 arquivos).
- Conteúdo permitido: erros, falhas de I/O, falhas de API, timing de operações, contagem de tokens, IDs internos.
- **Proibido em logs**: conteúdo de páginas, conteúdo de mensagens de chat, conteúdo de notas, conteúdo de memória, chave OpenRouter, qualquer texto vindo do material do usuário.
- Logs usam IDs (`zetel_id`, `page_id`, `message_id`) e contagens; nunca substrings de conteúdo.
- Nível default: `info`; configurável via `LOG_LEVEL` em `~/.zetel/config`.

### 16.2 Imagens em Markdown

- **Caminhos relativos** (`./images/foo.png`, `images/foo.png`): durante "Processar", imagens referenciadas são copiadas para `zetels/<slug>/images/` e o caminho no HTML é reescrito para o destino correto.
- **Caminhos absolutos no filesystem do usuário** (`/Users/...`): copiados também para `images/` se acessíveis; aviso no log se não acessíveis.
- **URLs externas** (`http://`, `https://`): **bloqueadas no MVP**. Ficam visíveis como placeholder com aviso "imagem externa bloqueada". Liberação fica para fase futura junto com modo internet.
- Imagens grandes (>2 MB) entram com aviso no log mas não são otimizadas no MVP.

## 17. Arquitetura técnica

- **Frontend**: Next.js (App Router) + React + TypeScript.
- **Backend**: rotas API do próprio Next.js, runtime Node.
- **SQLite**: `better-sqlite3` em **instância única (conexão singleton)** por processo — a biblioteca é síncrona e não usa pool de conexões.
- **Pipeline de leitura**: `remark` + `rehype` + plugins (gfm, slug estável, autolink-headings) + sanitização explícita + pós-processamento que copia imagens locais para `images/` e reescreve `src`. CSS dedicado para visual híbrido artigo/apresentação.
- **Chat**: SSE para streaming. SDK do OpenRouter (compatível com OpenAI) chamado a partir do backend. Backend valida `page_id` contra `zetel_pages` antes de injetar contexto.
- **Sanitização**: `rehype-sanitize` no caminho do HTML, com allowlist explícita (sem `<script>`, sem `<iframe>`, sem URLs externas para imagens no MVP).
- **Isolamento da leitura**: `<iframe sandbox>` sem flags adicionais por padrão. `allow-same-origin` só é adicionado **se o Spike B do Módulo 0 justificar** (por exemplo, para mini-índice via âncoras dentro do iframe). A decisão final fica registrada como saída do spike.
- **Migrations**: arquivos SQL versionados em `migrations/`, aplicação no boot via `schema_migrations`.
- **Logs**: arquivo rotacionado em `~/.zetel/logs/`, sem conteúdo do usuário.
- **Slug imutável**: criação gera slug derivado do nome inicial; mudanças posteriores afetam apenas `display_name`.

## 18. Roadmap

Detalhado na Parte B. Resumo:

- Módulo 0 (spikes) → 1 (fundação) → 2 (CRUD) → 3 (ingestão) → 4 (leitura) → 5 (settings/OpenRouter) → 6 (chat) → 7 (notas) → 8 (memória) → 9 (polimento) **= MVP textual entregue.**
- Pós-MVP: 10 (prompts editáveis) → 11 (internet) → 12 (TTS) → 13 (STT) → 14 (memória emergente).

## 19. Fase 2 e além — visão preservada

A visão do produto inclui voz natural, modo internet, memória emergente, edição runtime de prompts e suporte a outros formatos (PDF, HTML, DOCX). Nenhum desses sai do mapa do produto. Eles foram removidos do MVP exclusivamente por gestão de risco e foco em valor incremental.

- **Voz** (Fase 2): TTS e STT. Provedor a definir após spike (D3). Push-to-talk como ponto de partida; VAD só se o spike justificar.
- **Internet** (Fase 2): tool-use de busca, fluxo de confirmação, selo "fonte externa".
- **Memória emergente** (Fase 2+): destilação pós-sessão proposta em fila para revisão; nunca silenciosa.
- **Prompts editáveis em runtime** (Fase 2): editor de texto com sistema explícito de variáveis `{{...}}`.
- **Outros formatos** (Fase 3): PDF, HTML, DOCX como ingestão nativa.

---

# Parte B — Plano Modular Revisado

## Princípios

- Cada módulo tem objetivo único, escopo fechado e critério de conclusão verificável.
- Cada módulo passa por um **gate manual** antes de o próximo começar.
- Módulos com risco técnico aberto começam com spike isolado, não direto em código de produto.
- Ordem prioriza reduzir incerteza cedo.

## Módulo 0 — Spikes técnicos e mock visual

**Objetivo:** eliminar incertezas remanescentes (não cobertas pelas decisões D1–D15) antes de qualquer código de produto.

**Entra:**
- Spike A: `remark`/`rehype` em Node, com Markdown real, gerando HTML paginado bonito por regras + CSS. Validar com 3 inputs: curto, médio (~5k palavras), longo (~30k palavras).
- Spike B: Mock visual estático (HTML + CSS, sem app) do "híbrido artigo + apresentação". Sem este mock aprovado, o Módulo 4 não começa.
- Spike C: `better-sqlite3` em Next.js App Router com runtime Node. Validar reload, conexão única, escrita em diretório arbitrário.
- Spike D: OpenRouter — chat em PT-BR com streaming SSE; endpoint `/models` retornando preços. (Áudio fica para Fase 2.)

**Fica de fora:** UI de produto, integração permanente.

**Critérios de conclusão:**
- [ ] Mock visual aprovado pelo dono do projeto.
- [ ] Pipeline Markdown→HTML rodando localmente, output reproduzível.
- [ ] OpenRouter respondendo chat em streaming, com preço listado.
- [ ] Documento curto (1 página) com lições e ajustes ao roadmap.

**Sinais de "não seguir":** se o pipeline determinístico não atinge a qualidade visual desejada, revisar mock antes de avançar. Se `better-sqlite3` não funcionar bem com Next.js App Router, decidir alternativa (Prisma, libsql) antes do Módulo 1.

**Dificuldade:** média. **Acoplamento futuro:** zero (descartável). **Modo:** protótipo descartável.

## Módulo 1 — Fundação

**Objetivo:** Next.js rodando local com vault path configurado e SQLite inicializado.

**Entra:**
- Bootstrap Next.js + TypeScript + App Router.
- Layout PT-BR com sidebar fixa (Zetel / Memória / Configurações).
- Tela de Configurações com path do vault e chave OpenRouter (campos, sem validação avançada).
- Inicialização do vault: ao salvar path, criar estrutura de §13.2.
- SQLite em `~/.zetel/zetel.db` + sistema de migrations versionadas (§13.6) com tabela `schema_migrations`. Migration `001_init.sql` cria as tabelas base (`settings`, esqueleto de `zetels`).
- Botão "Testar conexão" para OpenRouter.
- Armazenamento da chave em `~/.zetel/config` com permissão `600` (D12), não em SQLite.
- Logger inicial gravando em `~/.zetel/logs/zetel.log` com política de §16.1 (sem conteúdo sensível).

**Fica de fora:** Zetel funcional, ingestão, chat.

**Dependências:** Módulo 0.

**Riscos:** validação do path (existe, é gravável, não é root, não é dentro do projeto); leitura/escrita atômica de settings.

**Critérios de conclusão:**
- [ ] App sobe em `localhost`.
- [ ] Salvar path cria árvore correta de pastas.
- [ ] Chave OpenRouter persiste corretamente em arquivo fora do projeto.
- [ ] Restart do app preserva tudo.

**Dificuldade:** baixa-média. **Acoplamento futuro:** alto. **Modo:** direto em produção.

## Módulo 2 — Zetel CRUD + Lixeira

**Objetivo:** entidade Zetel funcional sem conteúdo.

**Entra:**
- Estado vazio com botão "Criar Zetel".
- Modal de criação: somente `display_name`; slug derivado por slugify + sufixo numérico em colisão; **slug imutável depois** (§13.7).
- Listagem (usa `display_name` para exibir).
- Renomear = alterar apenas `display_name` em `zetels`. Pasta no disco **não muda**.
- Mover para lixeira: move pasta para `zetels/.lixeira/<slug>-<timestamp>/` e marca `trashed_at`. Pasta de origem sai de `zetels/<slug>/`. Esta operação é **a única operação física sobre a pasta** no MVP — feita com `fs.rename` (atômico no mesmo filesystem).
- Restaurar: move de volta para `zetels/<slug>/`. Se já existir uma pasta com o mesmo slug (cenário raro), restauração é rejeitada com mensagem clara.
- Excluir definitivamente: remove pasta da lixeira e linha do SQLite.

**Fica de fora:** arquivos, leitura, chat, renomeação física de pasta.

**Dependências:** Módulo 1.

**Riscos:** colisão de slugs em criação; lixeira interrompida no meio do `rename`; restauração sobre slug já reutilizado.

**Critérios de conclusão:**
- [ ] Todas as operações consistentes entre disco e SQLite (testar fechando o app no meio).
- [ ] Sem órfãos em nenhum cenário testado manualmente.
- [ ] `display_name` editável sem afetar pasta nem `slug`.
- [ ] Tentar restaurar para slug ocupado falha com mensagem clara.

**Dificuldade:** média. **Acoplamento futuro:** alto. **Modo:** direto em produção.

## Módulo 3 — Ingestão de Markdown + aba Arquivos

**Objetivo:** anexar `.md` a um Zetel e gerenciá-los, com ordem explícita.

**Entra:**
- File picker e drag-and-drop dentro do Zetel.
- Validação `.md`.
- Cópia para `arquivos/` com nome preservado; nome duplicado recebe sufixo numérico.
- Aba "Arquivos" listando arquivos com nome, tamanho, data, ordem, e badge "modificado externamente" quando detectar drift.
- Drag-to-reorder afeta `order_index` no SQLite.
- Remover arquivo: confirmação + remoção do disco + atualização do índice.
- Botão "Processar":
  - lê arquivos na ordem;
  - calcula `content_hash`, captura `size_bytes` e `last_seen_mtime` e atualiza `zetel_files`;
  - gera AST consolidado e índice de headings com anchors estáveis;
  - persiste cada página em `zetel_pages` com `content_text` e `content_hash` (a "página" aqui é a unidade lógica derivada da heurística de paginação, mas no Módulo 3 já basta segmentar por heading raiz como ponto de partida — a paginação final do HTML acontece no Módulo 4 e pode mudar a granularidade);
  - copia imagens locais referenciadas para `images/` (§16.2) e mantém um mapa de path→novo path para o Módulo 4 reescrever.
- Marca `reading_stale = true` em `zetels` ao adicionar, remover ou reordenar.
- Detecção de drift: ao abrir o Zetel ou antes de "Processar", o backend lê `stat()` de cada arquivo em `arquivos/` e compara `last_seen_mtime` e `size_bytes`. Mudanças marcam `reading_stale = true` e exibem badge na lista.

**Fica de fora:** geração de HTML, chat, otimização de imagens.

**Dependências:** Módulo 2.

**Riscos:** encoding (UTF-8 sem BOM), colisão de IDs de heading entre arquivos (slug com prefixo do arquivo resolve), ordem não-determinística sem `order_index`, drift não detectado se mtime for igual mas conteúdo mudou (hash resolve).

**Critérios de conclusão:**
- [ ] Adicionar/remover/reordenar refletem em disco e SQLite.
- [ ] Reprocessar com mesmo input produz mesma estrutura e mesmos hashes.
- [ ] `reading_stale` corretamente marcado em mutações e em drift.
- [ ] Drift detectado quando arquivo é editado fora do app entre processamentos.
- [ ] Imagens locais relativas são copiadas para `images/` e o mapa de paths é registrado.

**Dificuldade:** baixa-média. **Acoplamento futuro:** alimenta Módulo 4. **Modo:** direto em produção.

## Módulo 4 — Leitura paginada determinística

**Objetivo:** ver o conteúdo do Zetel como HTML paginado, bonito, sem AI.

**Entra:**
- Pipeline `remark` (parse) → `rehype` (HTML) → `rehype-sanitize` (allowlist explícita) → reescrita de `<img src>` usando o mapa do Módulo 3 → CSS dedicado.
- Paginação por heurística: quebra em headings (H1/H2) + tamanho máximo de bloco. Definida no Módulo 0.
- Atualização de `zetel_pages` para refletir as páginas finais (anchor, heading, `content_text`, `content_hash`) — pode regravar o que foi gerado no Módulo 3 com granularidade definitiva.
- Geração de `artefatos/leitura.html` autocontido (CSS inline, imagens via caminho relativo para `../images/`).
- Botão "Preparar leitura"; rotulado como "Atualizar leitura" quando `reading_stale = true`. Ao concluir, marca `reading_stale = false` e atualiza `last_built_at`.
- Aba "Leitura" renderiza HTML em `<iframe sandbox>` (flags revisitadas após Spike B) (D13).
- Mini-índice lateral derivado dos headings do Markdown original (D11), persistido em `zetel_pages`.
- Navegação por setas anterior/próxima; cada página tem `anchor` estável que o chat reutiliza.
- Aba "Artefatos" implementada: lista o HTML gerado, mostra metadata (`last_built_at`, tamanho, contagem de páginas), botões "Baixar HTML" e "Regenerar".
- Imagens externas (URLs) renderizadas como placeholder com aviso (§16.2).

**Fica de fora:** chat, qualquer LLM.

**Dependências:** Módulo 3 + mock aprovado no Módulo 0.

**Riscos:** páginas longas, tabelas e blocos de código grandes quebrando layout, conteúdo com matemática (KaTeX é fase 2), sanitização atrapalhando estilo.

**Critérios de conclusão:**
- [ ] Markdowns de teste curto/médio/longo renderizam sem travar.
- [ ] Mini-índice navega corretamente.
- [ ] HTML é autocontido (abre fora do app também).
- [ ] Regenerar produz mesmo arquivo para mesmo input.
- [ ] Visualmente próximo do mock aprovado.

**Dificuldade:** média-alta. **Acoplamento futuro:** chat consulta este módulo. **Modo:** direto em produção, com mock validado antes.

## Módulo 5 — Configurações: OpenRouter + modelo de chat

**Objetivo:** modelo de chat selecionado, testado, persistido.

**Entra:**
- Tela "Modelos" buscando catálogo via `/api/openrouter/models`.
- Exibição de preço input/output por 1M tokens.
- Seleção do modelo de chat ativo, persistida em `settings`.
- Botão "Atualizar" reexecuta fetch.
- Estado claro em outras telas quando "sem chave" ou "sem modelo".

**Fica de fora:** TTS, STT, prompts editáveis, internet.

**Dependências:** Módulo 1 + Módulo 0 (spike D).

**Riscos:** unidades de preço inconsistentes no catálogo; rate limits do endpoint.

**Critérios de conclusão:**
- [ ] Lista modelos com preço corretamente formatado.
- [ ] Seleção persiste após restart.
- [ ] Telas de Zetel mostram estado "sem chave / sem modelo" graciosamente.

**Dificuldade:** baixa-média. **Acoplamento futuro:** todo módulo de LLM depende. **Modo:** direto em produção.

## Módulo 6 — Interação textual (chat)

**Objetivo:** conversar por texto com o parceiro sobre a página atual.

**Entra:**
- Painel lateral recolhível com input de texto e histórico.
- Botão "Interagir": abre painel; envia saudação contextual **apenas se histórico vazio** (I1).
- Histórico persistido em `chat_messages` por Zetel (D6).
- Prompt do parceiro lido de `config/prompts/parceiro.md`.
- **Contrato do chat** (servidor):
  - cliente envia `page_id` (ou anchor) e mensagem; conteúdo da página é opcional (otimização);
  - servidor valida `page_id` contra `zetel_pages`; se inválido, 400 + instrução de reprocessar;
  - servidor usa `zetel_pages.content_text` como fonte autoritativa do conteúdo da página injetado no prompt;
  - servidor registra em `chat_messages.meta`: `page_id`, `page_anchor`, `page_hash_match`, `model`, `tokens_in`, `tokens_out`.
- Composição do contexto por turno (em ordem):
  1. system prompt do parceiro;
  2. memória global truncada (máx. 40% do orçamento, §11);
  3. últimos N turnos do histórico, truncados por orçamento;
  4. página validada (`content_text` + `heading` + `anchor`);
  5. mensagem do usuário.
- Orçamento total de tokens default conservador (a calibrar no módulo); políticas de truncagem por janela deslizante.
- Streaming SSE da resposta do LLM.
- Painel recolhido **não encerra a sessão** (I5).

**Fica de fora:** voz, sugestão de notas/memória, internet.

**Dependências:** Módulos 4 e 5.

**Riscos:** custo por turno alto se enviar página inteira; latência percebida; truncagem de histórico mal calibrada.

**Critérios de conclusão:**
- [ ] Streaming funciona e responde em <5s para primeiro token com modelo médio.
- [ ] Histórico não vaza entre Zetels.
- [ ] Trocar de página altera o contexto enviado.
- [ ] Recolher o painel preserva o estado.
- [ ] Reabrir um Zetel restaura o histórico sem nova saudação.
- [ ] `page_id` inválido retorna 400 com mensagem clara.
- [ ] `chat_messages.meta` registra `page_id`, `page_hash_match`, modelo e contagem de tokens em todos os turnos.
- [ ] Conteúdo da página injetado vem de `zetel_pages.content_text`, não do cliente.

**Dificuldade:** média. **Acoplamento futuro:** notas e memória crescem aqui. **Modo:** direto em produção.

## Módulo 7 — Notas cooperativas

**Objetivo:** parceiro propõe notas; usuário aprova; vira arquivo Markdown.

**Entra:**
- Prompt do parceiro lido de `config/prompts/sugestao-nota.md`, contendo a **rubrica mínima de §10.1** (critérios e anti-padrões explícitos).
- Output estruturado (JSON) com campos: `tipo` (rapida|literatura), `titulo`, `corpo`, `pagina_origem` (anchor), `justificativa` (interna, não exibida).
- Renderização da sugestão na conversa como card distinto com quatro botões.
- Ações:
  - **Guardar**: salva direto em `notas-rapidas/` ou `notas-literatura/` com frontmatter de §13.3.
  - **Editar**: campo inline para revisar antes de salvar.
  - **Discutir**: devolve sugestão como mensagem; uma rodada de refinamento; depois reapresenta com 3 botões (sem Discutir novamente) (I7).
  - **Rejeitar**: descarta (registrar em `chat_messages.meta` para análise futura — só ID e contagem, sem conteúdo).
- Abas "Notas rápidas" e "Notas de literatura" listam arquivos do vault. Para cada nota, o app oferece **abertura externa em cascata**: (1) tentar `obsidian://open?vault=...&file=...` se a URI estiver disponível; (2) fallback primário: **copiar o caminho absoluto** para o clipboard com toast; (3) fallback secundário: **abrir a pasta que contém o arquivo** via shell do SO.
- Slug do arquivo derivado do título; colisão recebe sufixo numérico.
- Antes de propor, parceiro consulta a lista de títulos já existentes no Zetel (via `GET /api/zetels/:id/notes/titles`) para evitar duplicatas — passada como contexto no prompt.

**Fica de fora:** memória global, tags automáticas, backlinks, editor embutido (D14).

**Dependências:** Módulo 6.

**Riscos:** parceiro propor demais (ruído); critérios de quando propor; slugs duplicados.

**Critérios de conclusão:**
- [ ] Sugestões aparecem visualmente diferenciadas.
- [ ] Quatro ações funcionam end-to-end.
- [ ] Notas salvas no vault têm frontmatter consistente; abrem corretamente no Obsidian.
- [ ] "Discutir" é bounded em 1 rodada.

**Dificuldade:** média. **Acoplamento futuro:** memória global reutiliza este fluxo. **Modo:** direto em produção.

## Módulo 8 — Memória global cooperativa

**Objetivo:** parceiro mantém memória global em Markdown, alimentada por sugestões confirmadas.

**Entra:**
- Pasta `parceiro/memoria/` com arquivos Markdown editáveis fora do app.
- Aba "Memória" no menu principal listando os arquivos com preview e botão de abertura externa seguindo a **mesma cascata definida no Módulo 7** (Obsidian URI → copiar caminho → abrir pasta).
- Mecanismo de proposta de memória **idêntico ao de notas** (D4).
- Leitura sob demanda da memória no início de cada turno do chat (não cache em memória do processo) (I-novo).
- Injeção concatenada e truncada por orçamento de tokens.
- Frontmatter de §13.4.

**Fica de fora:** observação automática, embeddings, retrieval.

**Dependências:** Módulo 7.

**Riscos:** memória inflando custos; conflito de edição app vs Obsidian; ausência de governança no crescimento.

**Critérios de conclusão:**
- [ ] Memória editada externamente é refletida no próximo turno.
- [ ] Memória influencia perceptivelmente as respostas do parceiro.
- [ ] Truncagem evita estouro de contexto.

**Dificuldade:** média. **Acoplamento futuro:** moderado. **Modo:** direto em produção, versão mínima primeiro.

## Módulo 9 — Polimento e fechamento do MVP textual

**Objetivo:** transformar o que existe em MVP defensável.

**Entra:**
- Estados vazios em todas as telas.
- Mensagens de erro para: sem chave, sem modelo, modelo fora do ar, falha de gravação no vault, vault path inválido, `page_id` inválido, drift detectado em arquivos.
- Tema claro/escuro.
- Revisão da política de logs (§16.1): grep no arquivo de log deve confirmar que **nenhum** conteúdo de página, chat, nota, memória ou chave aparece.
- Instruções de backup do vault (e nota de que SQLite + HTML são regeneráveis a partir do vault).
- Verificação end-to-end manual: criar → adicionar arquivos → ordenar → processar → preparar leitura → ler → conversar → aceitar nota → aceitar memória → conferir no Obsidian → editar nota no Obsidian → reabrir app e ver mudança.

**Fica de fora:** voz, internet, prompts editáveis.

**Dependências:** Módulos 1–8.

**Riscos:** subestimar tempo de polimento.

**Critérios de conclusão:**
- [ ] Jornada completa executável por outra pessoa sem ajuda.
- [ ] Nenhum erro silencioso conhecido.
- [ ] Logs registram falhas críticas **sem conteúdo sensível** (validar por amostragem).
- [ ] Apagar `~/.zetel/zetel.db` e reabrir o app: vault sobrevive, HTML regenerável, histórico de chat se perde (esperado).
- [ ] Apagar `artefatos/leitura.html`: "Atualizar leitura" reconstrói tudo.

**Dificuldade:** baixa-média (mas demorada). **Modo:** direto em produção. **Marco:** MVP TEXTUAL ENTREGUE.

## Módulos pós-MVP (resumo)

### Módulo 10 — Prompts editáveis em runtime
- Editor de texto livre na UI para os prompts do MVP.
- Sistema explícito de variáveis (`{{pagina_atual}}`, `{{nome_zetel}}`, `{{memoria}}`, `{{historico}}`).
- Botão "Restaurar padrão".

### Módulo 11 — Modo internet
- Mecanismo de busca (a definir entre tool-use OpenRouter e API direta).
- Toggle global e por sessão.
- Confirmação antes da chamada.
- Selo "fonte externa" e estilo distinto.

### Módulo 12 — Voz: TTS
- Spike de provedor (D3): OpenRouter, OpenAI direto, ou ElevenLabs/Deepgram.
- Streaming de áudio.
- Player com pausa/stop/mute.
- Seção Voz nas configurações.

### Módulo 13 — Voz: STT
- Captura de áudio com **push-to-talk** (sem VAD inicial).
- Envio para STT.
- Transcrição visível antes do envio ao chat.

### Módulo 14 — Memória observada automaticamente
- Destilação pós-sessão: parceiro propõe entradas em fila de revisão.
- UI dedicada para aceitar/rejeitar em lote.

## Ordem de execução

```
0  Spikes + mock visual
 ↓
1  Fundação (Next.js + vault + SQLite + settings mínimas)
 ↓
2  Zetel CRUD + lixeira
 ↓
3  Ingestão Markdown + aba Arquivos
 ↓
4  Leitura paginada determinística
 ↓
5  Configurações OpenRouter + modelo de chat
 ↓
6  Chat textual
 ↓
7  Notas cooperativas
 ↓
8  Memória cooperativa
 ↓
9  Polimento → MARCO: MVP TEXTUAL ENTREGUE
────────── corte de MVP ──────────
10 Prompts editáveis em runtime
11 Modo internet
12 TTS (Fase 2 — voz)
13 STT (Fase 2 — voz)
14 Memória observada automaticamente
```

## Gates de validação entre módulos

Cada gate é checado manualmente. Se algum item falha, o módulo atual é revisitado antes de o próximo começar.

- **Gate 0 → 1**: mock visual aprovado; pipeline Markdown→HTML funcionando; OpenRouter respondendo em streaming; SQLite em Next.js sem regressão em reload.
- **Gate 1 → 2**: app sobe; chave persiste em arquivo fora do projeto; vault inicializado.
- **Gate 2 → 3**: CRUD + lixeira sem órfãos em nenhum cenário testado (incluindo crash simulado entre operações).
- **Gate 3 → 4**: reprocessar mesmo input dá mesma estrutura; `reading_stale` corretamente marcado em todas as mutações de arquivos.
- **Gate 4 → 5**: HTML reproduzível, autocontido, visualmente próximo do mock; mini-índice navega corretamente em 3 inputs distintos.
- **Gate 5 → 6**: modelo selecionado persiste; UI lida com ausência de chave/modelo sem quebrar.
- **Gate 6 → 7**: chat com streaming responde em <5s para primeiro token; histórico isolado por Zetel; saudação só quando histórico vazio.
- **Gate 7 → 8**: quatro ações de nota funcionam; arquivos salvos abrem no Obsidian; "Discutir" não loopa.
- **Gate 8 → 9**: memória editada externamente é refletida; truncagem opera; respostas do parceiro mudam ao adicionar memória relevante.
- **Gate 9 → release**: jornada completa executada por outra pessoa sem ajuda; logs registram falhas; backup documentado.

---

# Parte C — Decisões Fundadoras D1–D15

> Estado de cada decisão crítica em **2026-05-28**. Atualizar sempre que houver revisão.
> Legenda: ✅ definido | 🧪 pendente de spike | 🗓️ fase futura | ⚠️ atenção contínua

| ID | Decisão | Resolução | Status | Quando aplica |
|----|---------|-----------|--------|---------------|
| D1 | Pipeline "Preparar leitura" | Determinístico: Markdown → AST via `remark` → HTML via `rehype` + plugins + CSS dedicado. Sem LLM. | ✅ | Módulos 0, 3, 4 |
| D2 | Voz no MVP | Fora do MVP. Voz vira Fase 2 (Módulos 12 e 13). Permanece na visão do produto. | ✅ | Módulos 12, 13 |
| D3 | Provedor de áudio | A definir após spike na Fase 2. Hipóteses: OpenRouter (se cobrir bem PT-BR), OpenAI direto, ElevenLabs ou Deepgram. Decidir por qualidade + latência + custo medidos. | 🧪 | Módulo 12 |
| D4 | Memória emergente automática | Fora do MVP. MVP usa memória cooperativa com confirmação. Versão automática vira Módulo 14. | ✅ | Módulos 8, 14 |
| D5 | Modo internet | Fora do MVP. Vira Módulo 11. | ✅ | Módulo 11 |
| D6 | Histórico de conversa | Por Zetel, persistido em SQLite (`chat_messages`). Não em Markdown. Truncagem por orçamento de tokens (limite definido em runtime, default conservador). | ✅ | Módulo 6 |
| D7 | Múltiplos arquivos por Zetel | A arquitetura suporta múltiplos desde o Módulo 3. Ordem é explícita via `order_index` no SQLite, reordenável por drag na aba Arquivos. | ✅ | Módulo 3 |
| D8 | Página atual | Cliente envia `page_id` (ou anchor canônico) a cada turno do chat. Pode enviar `content_text` apenas como otimização. **Servidor valida `page_id` contra `zetel_pages` e usa `zetel_pages.content_text` como fonte autoritativa do conteúdo injetado no prompt.** Divergência de `content_hash` é registrada em `chat_messages.meta.page_hash_match = false` e o conteúdo do cliente é descartado. Servidor não mantém estado de "página corrente" entre turnos. | ✅ | Módulo 6 |
| D9 | Lixeira | Pasta no vault (`zetels/.lixeira/<slug>-<timestamp>/`). Flag `trashed_at` em `zetels` para listagem. Exclusão definitiva move pasta fora e remove linha. | ✅ | Módulo 2 |
| D10 | Prompts editáveis na UI | Fora do MVP. Prompts ficam em arquivos versionados em `config/prompts/` no vault. Editor runtime vira Módulo 10. | ✅ | Módulo 10 |
| D11 | Mini-índice | Derivado dos headings do Markdown original. Gerado no "Processar" e persistido em `zetel_pages`. | ✅ | Módulos 3, 4 |
| D12 | Armazenamento da chave OpenRouter | Arquivo `~/.zetel/config` com permissão `600`. Fora do vault, fora do projeto, fora do SQLite. Não vai para git. | ✅ | Módulo 1 |
| D13 | Sanitização do HTML | HTML autocontido (CSS inline) gerado por `rehype` + `rehype-sanitize` com allowlist explícita. Renderização em `<iframe sandbox>`; `allow-same-origin` só se o Spike B justificar. | ✅ | Módulo 4 |
| D14 | Editor de notas | Apenas externo no MVP; sem editor embutido. App tenta abrir no Obsidian via URI `obsidian://` quando disponível, com fallbacks: copiar caminho absoluto para o clipboard e, em último caso, abrir a pasta que contém o arquivo no shell do SO. | ✅ | Módulo 7 |
| D15 | Idioma do parceiro | PT-BR por padrão, independente do idioma do conteúdo. Configurável em fase futura. | ✅ | Módulos 6, 7, 8 |

Itens pendentes (não estão entre D1–D15) que ainda exigem atenção contínua:

- ⚠️ **Tamanho ideal de página** na heurística de paginação determinística. Calibração no Módulo 0/4.
- ⚠️ **Orçamento de tokens por turno**: definir defaults conservadores no Módulo 6 e revisar no Módulo 8.
- ⚠️ **Estratégia de regeneração do HTML** quando memória/notas mudam: no MVP, regeneração só ao mudar arquivos. Mudança de memória não regenera HTML.

## Decisões técnicas complementares (DT1–DT5)

Estas decisões surgiram durante a rodada de ajustes técnicos. Não substituem D1–D15; complementam.

| ID | Decisão | Resolução | Aplica em |
|----|---------|-----------|-----------|
| DT1 | Renomeação de Zetel | Slug físico imutável; `display_name` mutável; pasta no disco não é renomeada no MVP. | Módulo 2, §13.7 |
| DT2 | Imagens em Markdown | Locais relativas: copiar para `images/` e reescrever `src` no HTML. Externas (`http`/`https`): bloqueadas no MVP, exibidas como placeholder. | Módulos 3 e 4, §16.2 |
| DT3 | Migrations | Arquivos SQL numerados (`001_init.sql`, ...) aplicados em ordem via tabela `schema_migrations`. Transação por migration. Sem down automática no MVP. | Módulo 1, §13.6 |
| DT4 | Logs | Arquivo rotacionado em `~/.zetel/logs/zetel.log`. Apenas IDs e contagens; sem conteúdo de página, chat, nota, memória ou chave. | Módulos 1 e 9, §16.1 |
| DT5 | Rubrica de notas | Rubrica explícita no prompt `config/prompts/sugestao-nota.md`; campo `justificativa` interno no JSON; anti-padrões explícitos. | Módulo 7, §10.1 |

---

# Parte D — Novas inconsistências identificadas na revisão

Durante a escrita do PRD v2 surgiram sete pontos de fricção que o PRD v1 não cobria. Resolvidos abaixo. Documentar agora evita perda em retrabalho depois.

### I1 — Estado do botão "Interagir" com histórico persistente

**Problema:** o PRD v1 dizia que ao clicar "Interagir" o parceiro envia uma saudação contextual. Mas se o histórico é persistido por Zetel (D6), abrir o painel pela segunda vez não pode disparar nova saudação — ficaria estranho e poluiria o histórico.

**Resolução:** "Interagir" abre o painel; saudação só é enviada quando `chat_messages` para o Zetel está vazio. Em aberturas subsequentes, o painel apenas restaura a conversa anterior. Tratado em §8.6 do PRD v2 e no Módulo 6.

### I2 — Leitura "desatualizada" quando arquivos mudam

**Problema:** se o usuário adiciona ou remove um `.md` após gerar o HTML, o HTML fica defasado, mas o PRD v1 não tinha mecanismo para sinalizar isso.

**Resolução:** flag `reading_stale` em `zetels`. Ao mudar arquivos, marca como `true`. O botão de "Preparar leitura" é renomeado para "Atualizar leitura" enquanto `reading_stale = true`. Tratado em §7 do PRD v2 e nos Módulos 3 e 4.

### I3 — Ordem dos arquivos em Zetel multi-arquivo

**Problema:** sem ordem explícita, a concatenação de múltiplos `.md` não é reproduzível. PRD v1 não definia.

**Resolução:** `order_index` em `zetel_files`. Ordem inicial = ordem de upload. Reordenável por drag-and-drop na aba Arquivos. Tratado em §13.1 e Módulo 3.

### I4 — Aba "Artefatos" com propósito redundante

**Problema:** o PRD v1 listava "Artefatos" mas a leitura já fica em "Leitura". Aba ficava sem função clara.

**Resolução:** "Artefatos" passa a ser a tela de **gestão** dos arquivos gerados (HTML), com metadata (data, tamanho, modelo se aplicável), botão "Baixar HTML" e botão "Regenerar". A experiência de leitura continua em "Leitura". Tratado em §6.2 e Módulo 4.

### I5 — Estado do painel de interação recolhido

**Problema:** o painel é recolhível, mas o PRD v1 não dizia se isso encerra a sessão.

**Resolução:** recolher apenas oculta o painel. A sessão (histórico, estado de streaming, etc.) permanece. Tratado em §8.6 e Módulo 6.

### I6 — Localização do SQLite

**Problema:** o PRD v1 dizia "SQLite local" mas não definia onde. Se ficar dentro do vault, o Obsidian o expõe como arquivo. Se ficar dentro do projeto, vai para git por acidente.

**Resolução:** SQLite vive em `~/.zetel/zetel.db`, fora do vault e fora do projeto. Permissão `600`. Tratado em §13.1 e §16.

### I7 — "Discutir" nota poderia loopar

**Problema:** o PRD v1 listava "Discutir" como uma das ações sem definir quantas rodadas. Risco real de loop.

**Resolução:** "Discutir" devolve a sugestão como prompt; **uma única rodada de refinamento**; depois reapresenta a versão revisada com três botões (Guardar, Editar, Rejeitar). Sem "Discutir" novamente. Tratado em §10 e Módulo 7.

---

# Estado e próximo passo

**PRD aprovado e consolidado.** Todos os ajustes de consistência foram aplicados em 2026-05-28. O documento está internamente coerente e pronto para uso como fonte única de verdade.

**Próximo passo: Módulo 0.**

- Spike A: `remark`/`rehype` gerando HTML paginado de inputs curto/médio/longo.
- Spike B: mock visual estático (HTML + CSS) do layout híbrido artigo+apresentação. **Sem este mock aprovado, o Módulo 4 não começa.**
- Spike C: `better-sqlite3` em Next.js App Router (runtime Node), singleton, escrita em diretório arbitrário.
- Spike D: OpenRouter — chat PT-BR com streaming SSE; `/models` com preços.

Gate de saída do Módulo 0: mock aprovado + todos os spikes verificados + documento de lições (1 página).
