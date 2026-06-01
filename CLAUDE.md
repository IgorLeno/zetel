# CLAUDE.md — Zetel

Zetel é um parceiro de estudos local-first textual, em Next.js, com vault Obsidian e SQLite como estado operacional.

**Estado atual: Módulo 12.0A concluído (gate passado em 2026-06-01). Módulo 11 concluído (gate 11.4 aprovado em 2026-05-31). Módulo 10 concluído (10A–10D; 10E parcial/absorvido). Próximo passo: Módulo 12.0B (integration tests + E2E mock) ou Módulo 12 (gestão de memória no app).**

#### Resumo
MVP textual entregue após gate manual (gate 8 → release com orientador pendente).

#### Data de conclusão
2026-05-30

#### Build / Gate
- `pnpm build` limpo
- Gate 8 → release: validação manual com orientador pendente

#### Entregáveis
- Robustez de erros API: `leitura/route.ts`; reads de `notes/titles`, `memory` GET, `memory/titles` (try/catch + JSON estruturado)
- **M6-1 fechada:** `config/prompts/parceiro.md` via `ensureParceiroPrompt` em `lib/chat-prompt.ts` (self-heal sem clobber); seed em `lib/vault.ts`; `partnerPrompt` em `buildOpenRouterMessages` (regra #5)
- **M6-3 fechada:** `ChatPanel` sempre montado em `LeituraPanel`; visibilidade via CSS `display:none` (stream não se perde ao recolher)
- Polish: `metadata`/`generateMetadata` (4 rotas); loading em "Remover" (`ArquivosPanel`) e "Limpar" (`ChatPanel`); tokens `--memory` / `--memory-dim` com variante dark em `globals.css`
- `docs/BACKUP.md` criado
- Ver `spikes/lessons.md` (Módulo 8)

#### Dívidas fechadas
- **M6-1** — prompt do parceiro lido do vault sob demanda
- **M6-3** — chat recolhível sem perder stream

#### Dívidas pendentes
- **M6-2** — saudação automática quando histórico vazio (I1); pós-MVP

#### Próximos passos
- Gate visual/manual do Documento Técnico refinado, se necessário.
- Próximo passo operacional: **Módulo 12 — gestão completa de memória no app** (PRD v3, ver `prd-v3.md`).

**Módulo 11 (Guia de Estudo: experiência interativa) concluído em 2026-05-31; gate 11.4 aprovado; `pnpm build` limpo.** **11.1** — template interativo em `renderStudyGuideHtml`: sidebar sticky (desktop) / nav compacta (mobile), quiz pedagógico (`data-answer-index`, feedback pós-clique, pontuação, reiniciar), glossário pesquisável, highlight de seção via `IntersectionObserver`. **11.2** — schema editorial v2 opcional (`comparison_tabs`, `accordions`, `timelines`, `tables`) + `renderV2Blocks`; compatibilidade retroativa. **11.3** — `buildSystemPrompt` como designer instrucional com blocos v2. **11.4** — validação com Zetel `dft` (reprocessado 28→27 páginas): `deepseek/deepseek-v4-flash`, 100% rastreabilidade (35/35 itens, 0 órfãos, 0 flagged), 4 tipos v2 preenchidos, HTML offline (~51 KB). Ressalva não-bloqueante: compat retroativa v1 não testada por ausência de fixture. Ver `spikes/lessons.md` (Módulos 11.1–11.4).

**Módulo 10D (Implementação do guia de estudo) implementado em 2026-05-30; `pnpm build` limpo (compile + lint + types); etapa LLM live requer chave (verificação manual pendente).** Portou o pipeline do spike 10C para produção via `POST /api/zetels/:id/build?mode=guia-estudo` → `generateStudyGuide` (`lib/study-guide-service.ts`). Sem migration SQLite; nenhum contrato existente quebrado; Regras #1/#2 preservadas. Ver `spikes/lessons.md` (Módulo 10D).

**Pipeline:** arquivos do Zetel reparseados com `parseMarkdownForSegmentation`/`segmentFile` (paridade com `renderZetel`) → `buildSourceIndex` (`lib/source-index.ts`: catálogo de blocos de topo com `sha256`, `heading_path`, `source_file` e **`page_index` da página que contém o bloco**, reusando `sha256`/`toPlainText` exportados de `ingestao-service`) → catálogo injetado no prompt → `openrouter.requestJson` (NÃO-streaming, **sem** `response_format` — prompt instrui JSON + `extractJson` tolerante a cerca ```json, R6), `temperature 0.3`, `max_tokens` via `study_guide_max_tokens` (default dimensionado pelo nº de blocos), timeout via `study_guide_timeout_s` (default 120s).

**Validação e rastreabilidade:** endurecimento (`resposta_correta ∈ opcoes`, quiz inválido removido com log) + `validateAndNormalize` (schema fatal: titulo/subtitulo/resumo + 5 coleções não vazias) → `computeTraceability` (R4/R5: `source.json` derivado **server-side** dos hashes que existem no catálogo; item sem hash válido entra `flagged:true`, não é descartado; cobertura/órfãos medidos).

**Renderização e artefatos:** `renderStudyGuideHtml` (template determinístico, CSS inline, sem CDN/LLM, tema claro/escuro via `data-theme`+`postMessage zetel:theme`, `IntersectionObserver` postando `zetel:page-change` com `data-page`). Grava `artefatos/{guia-estudo.html, guia-estudo.meta.json, guia-estudo.source.json}`. `getArtifactsInfo` (`render-service`) reporta `guiaEstudo.exists/metaExists/sourceExists/model/generatedAt/counts` via `getStudyGuideInfo`. `GET /api/zetels/:id/leitura?artifact=guia-estudo` serve o guia.

**UI e limitações (D27):** o `page_index` derivado embutido no guia posta um `pageIndex` real → reusa D8 e a Regra #3 (fonte = `zetel_pages.content_text`), sem tocar o chat route. `LeituraPanel`: modo "Guia de Estudo" ativado; `selectedMode` é build-target E view (empty-state quando o artefato do modo ainda não existe). Modelo: `study_guide_model` → `default_model` → `OPENROUTER_MODEL` (`resolveStudyGuideModel`); settings `study_guide_model`, `study_guide_max_tokens`, `study_guide_timeout_s` em Configurações. D28 parcial: `chat_model`, `note_model`, `memory_model`, `study_guide_review_model` e UI completa por tarefa → M12; `tech_doc_model` existe na UI mas Documento Técnico continua sem LLM (setting reservada).

**Módulo 10C (Spike de guia de estudo com LLM) concluído em 2026-05-30; spike isolado em `spikes/spike-10c-guia-estudo/` (zero toque em produção, R1); `pnpm build` raiz limpo; execução live com `anthropic/claude-3.5-haiku` (default do config) gerou JSON D26 válido com 100% de rastreabilidade (18/18 itens, 0 hashes órfãos).** Recomendação: **GO para o Módulo 10D**. Validou o pipeline editorial Markdown → LLM (JSON) → template determinístico (D26/D27): a LLM gera **só JSON, nunca HTML** (R2). Achado central: rastreabilidade confiável vem de **pré-segmentar o Markdown em blocos com `sha256` (parser paritário com `parseMarkdownForSegmentation`) e injetar esse catálogo no prompt**, instruindo a LLM a *copiar* hashes em vez de inventá-los, com **validação pós-resposta** (hash citado deve existir no catálogo → cobertura medida, órfãos contados). Entregáveis do spike: `lib-source-index.mjs` (catálogo de blocos), `run-guia.mjs` (chamada OpenRouter paritária com `lib/openrouter.ts`/`lib/config.ts`, sem SDK, chave via env→`~/.zetel/config`, schema D26 + validação de schema/rastreabilidade), `run-render.mjs` (template HTML determinístico, sem LLM/rede), `input.md` sintético (Transformada de Fourier; H1–H3, eqs inline+bloco, tabelas GFM, ≥3 seções), `output/{guia-estudo.json,guia-estudo.source.json,guia-estudo.html,source-index.json}` e `README.md` com modelo/tokens/limitações/go-no-go. Ajustes recomendados para o 10D: reusar parser/segmentação de produção (idealmente derivar blocos de `zetel_pages.content_text`), gerar `guia-estudo.source.json` server-side a partir dos hashes validados, espelhar o template de `lib/render-service.ts` (CSS inline, `<iframe sandbox>`, Regra #2), dimensionar `max_tokens`/`temperature` e validar `response_format` por modelo (Módulo 10E — `study_guide_model`), e endurecer o validador (`resposta_correta ∈ opcoes`). Ver `spikes/spike-10c-guia-estudo/README.md` e `spikes/lessons.md` (Módulo 10C).

**Módulo 10B (Redesign visual compartilhado / ajustes finos) implementado em 2026-05-30; `pnpm build` limpo; smoke com Zetel DFT real confirmou KaTeX inline renderizado, sem caixas `<code>` para expressões matemáticas, mantendo `3c` como código.** Entregou: refinamento visual do Documento Técnico em `lib/render-service.ts` (tokens semânticos de tema, capa com marca/metadados, tipografia, KaTeX com fundo/borda/scroll, blockquotes, listas aninhadas, tabelas, mini-índice com scroll/ativo e navegação); ajuste dos controles 10A em `app/globals.css`; `remark-frontmatter` + `parseMarkdownForSegmentation` compartilhado em `lib/ingestao-service.ts` para remover YAML inicial antes da segmentação e preservar paridade `processZetel`/`renderZetel`; correção de conteúdo no vault ativo `zetels/dft2/arquivos/dft_teoria_funcional_densidade.md`, trocando backticks matemáticos por `$...$`. Sem migration SQLite; sem alteração de contratos de API; Regra #1 e Regra #2 preservadas. Ver `spikes/lessons.md` (Módulos 9/10B).

**Módulo 10A (Arquitetura de artefatos de leitura) implementado em 2026-05-30; `pnpm build` limpo; smoke em HOME/vault temporários confirmou geração canônica `artefatos/leitura-tecnica.html`, metadata `mode:"tecnico"`, fallback legado `artefatos/leitura.html` com `mode:"legado"` e `/api/zetels/:id/leitura` servindo o legado.** Entregou: `renderZetel` grava Documento Técnico em `leitura-tecnica.html`; `resolveLeituraHtmlArtifact` prioriza canônico e cai para legado; `/artifacts` expõe `mode`, `openArtifact`, `documentoTecnico` e placeholder `guiaEstudo.exists:false`; UI de Leitura ganhou seletor de modo (na entrega 10A o Guia estava desabilitado — "Em breve"). **Nota pós-10D:** toggle funcional entre Documento Técnico e Guia de Estudo; `LeituraPanel` oferece Gerar/Regenerar Guia. Sem migration SQLite; sem alteração em `lib/ingestao-service.ts`; Regra #1 e Regra #2 preservadas.

**Módulo 9 (Qualidade visual da leitura) — etapa 9.2 implementada em 2026-05-30; `pnpm build` limpo; render verificado por harness (KaTeX/MathML, highlight, fontes woff2 inline, tema escuro escopado); gate visual manual em app pendente.** Entregou: `lib/sanitize.ts` estendido com subset MathML (+`annotation-xml`) e atributos do KaTeX (`style` só em `span`/`mstyle`, `ariaHidden` em `*`; `rehype-highlight` dispensa extensão); `remark-math` adicionado ao parser de segmentação em `processZetel` (`ingestao-service.ts`) **e** `renderZetel` (`render-service.ts`) — devem ficar IDÊNTICOS pela paridade `anchor`/`content_hash`; `pageNodesToHtml` agora `remark-rehype`→`rehype-katex`→`rehype-slug`→`rehype-highlight` (subset 7 linguagens, `detect:false`) — Regra #1 preservada no Documento Técnico (sem LLM); `leitura.html` com CSS inline (`katex.min.css` + 20 fontes woff2 como `data:` URIs → 100% offline, ~0,35 MB; `github.css` claro + `github-dark.css` escopado sob `[data-theme="dark"]`); template novo: tipografia unificada em `system-ui` (consolidado no 10B; corpo ~860px, line-height 1.6, `text-wrap:pretty`; M9 original usava serif Georgia/65ch), **capa para primeira página com H1 isolado (fecha dívida HTML-1)**, blockquote com borda+fundo itálico, tabelas com `.table-wrap` (`overflow-x`) e sticky header (>10 linhas), fallback de bloco mermaid via `:has()` (badge discreto, adiado p/ PRD v4); tema por `data-theme` com fallback `prefers-color-scheme` (script no `<head>`) + listener `postMessage` `zetel:theme`; mini-índice com seção ativa via `IntersectionObserver` + dropdown `<select>` < 768px; botões Anterior/Próxima ≥44px com "Página X de Y" e estados desabilitados. `components/LeituraPanel.tsx` envia o tema ao iframe no `onLoad` e via `MutationObserver` do `data-theme` no `<html>` (D13/Regra #2: o app NÃO injeta CSS, só `postMessage`). Deps adicionadas: `remark-math@^6`, `rehype-katex@^7`, `rehype-highlight@^7`, `katex@^0.16`, `highlight.js@^11`. Ver `spikes/lessons.md` (Módulo 9).

**Módulo 7 (Memória cooperativa) concluído em 2026-05-29 — Gate 7 → 8 OK (validado 2026-05-30).** Módulo 7 entregou: `lib/memory-service.ts` (filesystem como fonte de verdade da memória global em `parceiro/memoria/`, frontmatter §13.4; sem tabela SQLite; escrita atômica `writeMemoryFile` com `flag:'wx'` + fallback `-2..-99`/timestamp; leitura sob demanda — regra #5; self-heal de `config/prompts/sugestao-memoria.md` sem clobber); injeção no chat via `buildMemoryContext(vaultPath)` chamado **a cada turno** dentro de `buildOpenRouterMessages` (ordem §8.7; truncagem a **40% do orçamento** = `MEMORY_TOKEN_BUDGET` 3200, corta arquivo inteiro priorizando recência; aviso "memória longa" acima de 10 KB sem corte automático); detecção de sugestão no stream via sentinela `<<<MEMORIA_SUGERIDA>>>…<<<FIM_MEMORIA>>>` com `earliestMark`/`HOLD = max(len marcadores)-1` retendo nota **e** memória (a `justificativa` nunca chega ao cliente) emitindo `data: [MEMORY_SUGGESTION]`; `MemoryCard` (Guardar/Editar/Discutir/Rejeitar; "Discutir" bounded em 1 rodada via `discussNextMemoryRef` — regra #10; "Discutir" mantido por fidelidade ao PRD §8 "mecanismo idêntico ao de notas", decidido no gate) + `MemoriaList` (aba `/memoria`, listagem + abertura externa em cascata D14); rotas `memory` (GET/POST), `memory/titles` (GET), `memory/reveal` (POST, anti path-traversal sob `parceiro/memoria/`) e `chat` PATCH (`kind:'memory'` → flag `memoryRejected`). `chat_messages.meta` ganha `suggestedMemory`/`memoryRejected`/`memoryLong`. Logs só contagens/`zetelOrigem` (regra #6). `pnpm build` limpo; fluxo de memória (salvar→frontmatter §13.4→listar→cascata→rejeitar) validado por inspeção; fluxo de sugestão/influência/truncagem com LLM real requer chave (teste manual). Ver `spikes/lessons.md` (Módulo 7).

**Módulo 6 (Notas cooperativas) concluído em 2026-05-29 — Gate 6 → 7 OK.** Módulo 6 entregou: `migrations/005_chat_meta.sql` (coluna `chat_messages.meta` JSON — **fecha o item 7 do Gate 5 → 6**); `lib/notes-service.ts` (filesystem como fonte de verdade das notas, frontmatter §13.3; sem tabela SQLite de notas); rotas `zetels/[id]/notes` (GET/POST), `notes/titles` (GET), `notes/reveal` (POST, com guarda anti path-traversal) e `chat` PATCH (flag `noteRejected`); detecção de sugestão no stream via sentinela `<<<NOTA_SUGERIDA>>>…<<<FIM_NOTA>>>` com buffer *held-back* (a `justificativa` nunca chega ao cliente) emitindo evento `data: [SUGGESTION]`; `NoteCard` (Guardar/Editar/Discutir/Rejeitar; "Discutir" bounded em 1 rodada — regra #10) + `NotasPanel` (listagem + abertura externa em cascata D14). Rubrica real em `config/prompts/sugestao-nota.md` (`SUGESTAO_NOTA_PROMPT`, self-heal sem clobber). `streamChat` agora envia `stream_options.include_usage` **sempre** e grava `tokens_in/out` em `meta` (contagens, não conteúdo — regra #6); `ZETEL_LOG_TOKENS` controla só o log em arquivo. `pnpm build` limpo; fluxo de notas (salvar→frontmatter→listar→cascata→rejeitar) validado end-to-end em HOME/vault isolados; fluxo de chat/sugestão com LLM requer chave (teste manual). Ver `spikes/lessons.md` (Módulo 6).

**Módulo 5 (Chat contextual com LLM) concluído em 2026-05-29 — Gate 5 → 6 OK (item 7 fechado no Módulo 6).** Módulo 5 entregou: `migrations/004_chat_messages.sql`; `types/chat-message.ts`; `lib/{chat-service,openrouter,chat-prompt}.ts`; rotas `zetels/[id]/chat` (GET/POST SSE/DELETE), `openrouter/test` (POST), `settings` (GET/PUT); `ChatPanel` + `LeituraPanel` (painel 320px, `postMessage` de página do iframe); Configurações (modelo padrão, janela de histórico 1–50, teste com modelo). OpenRouter via `fetch` no backend (sem SDK); chave via `readApiKey()` (env fallback → `~/.zetel/config`). Ver `spikes/lessons.md` (Módulo 5).

**Módulo 4 (Leitura paginada determinística) concluído em 2026-05-29 — Gate 4 → 5 OK.** Módulo 4 entregou: `lib/render-service.ts` (`renderZetel`: re-segmentação com paridade de `anchor`/`content_hash`, MDAST→HTML via `remark-rehype`+`rehype-slug`+`hast-util-sanitize`, reescrita de imagens com sentinelas, template autocontido `artefatos/leitura.html` com mini-índice e JS de navegação); `lib/sanitize.ts`; `lib/format-utils.ts`; rotas `build` (POST), `leitura` (GET HTML), `artifacts` (GET metadata); UI `LeituraPanel` (iframe `sandbox="allow-scripts"`, Preparar/Atualizar leitura) + `ArtefatosPanel` (metadata, baixar, regenerar). `renderZetel` seta `reading_stale=0` + `last_built_at`; `processZetel` seta `reading_stale=1` (HTML desatualizado até build). Deps: `rehype-slug rehype-sanitize remark-rehype hast-util-to-html hast-util-sanitize` (+ `@types/hast` dev). `pnpm build` limpo. Ver `spikes/lessons.md` (Módulo 4).

**Módulo 3 (Ingestão de Markdown + aba Arquivos) concluído e validado em 2026-05-29 — Gate 3 → 4 OK.** Módulo 3 entregou: `migrations/003_ingestao.sql` (`zetel_files`, `zetel_pages` com `UNIQUE (zetel_id, anchor)` e índices); `types/zetel-file.ts` e `types/zetel-page.ts`; `lib/ingestao-service.ts` (add/list/reorder/remove + `processZetel` determinístico: parse `remark`+`remark-gfm` → mapa de imagens → **segmentação por arquivo** com `page_index` global contínuo → `zetel_pages`, idempotente); rotas `zetels/[id]/files` (GET/POST multipart), `files/[fileId]` (DELETE), `files/order` (PATCH), `process` (POST); UI `ArquivosPanel` + badge de leitura no header. `reading_stale=1` nas mutações e após `processZetel`; build limpa stale. Imagens externas (`__blocked__`); locais em `images/` (`__notfound__` quando ausente). Ver `spikes/lessons.md` (Módulo 3).

**Módulo 2 (Zetel CRUD + Lixeira) concluído e validado em 2026-05-29 — Gate 2 → 3 OK.** Módulo 2 entregou: `migrations/002_zetel_crud.sql` (índices `trashed_at`/`slug`); `types/zetel.ts`; `lib/zetel-service.ts` (slugify determinístico, slug único global incl. lixeira, create/list/rename/trash/restore/purge com consistência DB→fs); rotas API `zetels` (GET/POST), `zetels/[id]` (PATCH/DELETE com `?purge=true`), `zetels/[id]/restore` (POST); UI `ZetelList` (lista, modais criar/renomear, confirmação de lixeira, menu de contexto), rota `/zetel/[slug]` com shell das 5 abas vazias (`ZetelTabs`), aba Lixeira nas Configurações (`ConfiguracoesTabs` + `LixeiraPanel`), `lib/relative-time.ts`, `components/Modal.tsx`. Lógica do serviço validada por teste de fumaça isolado (20/20 checks). Ver `spikes/lessons.md` (Módulo 2).

Módulo 1 (Fundação) concluído em 2026-05-29: scaffold Next.js 15 + TS strict + better-sqlite3 + Tailwind v4; `lib/{paths,logger,config,db,migrate,settings,vault}.ts`; `001_init.sql`; rotas `vault`/`config`/`test-connection`/`theme`; shell de UI + Configurações. Quitou dívidas #1/#2/#3/#7/#8 do Módulo 0. Módulo 0: spikes A/B/C/D concluídos; Spike B aprovado por Igor; Spike D TTFT 1 006 ms. PRD v2 aprovado em 2026-05-28.

---

## Fontes de verdade

| Arquivo | Papel |
|---------|-------|
| `piped-pondering-dahl2.md` | PRD v2 completo (Partes A–D, D1–D15, DT1–DT5) — fonte autoritativa do MVP textual (Módulos 1–8) |
| `prd-v3.md` | PRD v3 — Módulos 9 e 10 como histórico; fonte autoritativa dos **Módulos 11 e 12** e das decisões D16–D28 |
| `spikes/lessons.md` | Calibrações e dívidas técnicas do Módulo 0 — leitura obrigatória antes do Módulo 1 |
| `estamos-construindo-um-projeto-humble-harbor.md` | Histórico: 5 ajustes de consistência aplicados ao PRD em 2026-05-28 |
| `zetel-prd-v1.md` (fora deste diretório) | Histórico; não consultar para decisões |

Regra: divergência entre este `CLAUDE.md` e o PRD → **PRD vence**. Este arquivo é resumo comportamental, não substituto.

---

## Stack obrigatória

Não escolher alternativas sem aprovação explícita.

- **Frontend**: Next.js (App Router) + React + TypeScript.
- **Backend**: rotas API do Next.js em **runtime Node** — não Edge (dependência de `better-sqlite3` e `fs`).
- **SQLite**: `better-sqlite3` em **instância única (singleton) por processo** — biblioteca síncrona, sem pool de conexões.
- **Pipeline Documento Técnico**: `remark` + `rehype` + plugins (gfm, slug estável, autolink-headings) + `rehype-sanitize` (allowlist explícita). Determinístico. **Sem LLM.**
- **Pipeline Guia de Estudo**: Markdown original → LLM gera JSON estruturado → template determinístico renderiza HTML. LLM nunca gera HTML final diretamente.
- **Chat**: SSE para streaming; OpenRouter (`fetch` em `lib/openrouter.ts`) só no backend — frontend nunca chama a API externa.
- **Idioma da UI e do parceiro**: PT-BR, independente do idioma do material (D15).

---

## Estrutura física (caminhos canônicos)

```
~/.zetel/
  zetel.db          # SQLite, permissão 600
  config            # chave OpenRouter, permissão 600
  logs/
    zetel.log       # rotacionado: 5 MB, mantém 3 arquivos

<vault>/
  zetels/
    <slug>/
      arquivos/       # .md originais copiados
      notas-rapidas/
      notas-literatura/
      artefatos/
        leitura-tecnica.html     # Documento Técnico; sucessor de leitura.html
        guia-estudo.html         # Guia de Estudo renderizado por template
        guia-estudo.meta.json    # metadados do guia
        guia-estudo.source.json  # rastreabilidade guide_block_id → Markdown
      attachments/
      images/         # imagens locais copiadas no "Processar"
    .lixeira/
      <slug>-<timestamp>/
  parceiro/
    memoria/          # arquivos .md de memória global

  config/
    prompts/
      parceiro.md
      sugestao-nota.md
      sugestao-memoria.md

<repo>/
  migrations/
    001_init.sql      # arquivos numerados, no código, fora do vault
    002_*.sql
```

SQLite e HTML ficam fora de controle de versão. Vault (Markdown) é amigo de git.

---

## Decisões fundadoras — referência rápida

Para detalhe completo, ver Partes C e D do PRD. Esta tabela usa as versões **corrigidas** (ajustes do plano `humble-harbor` já incorporados aqui).

| ID | Decisão |
|----|---------|
| D1 | Pipeline Documento Técnico é determinístico: `remark`→`rehype`+CSS. Sem LLM. |
| D2 | Voz fora do MVP; vira PRD v4 (TTS e STT). |
| D3 | Provedor de áudio a definir após spike na Fase 2. |
| D4 | Memória emergente automática fora do MVP; cooperativa com confirmação no MVP. |
| D5 | Modo internet fora do MVP; vira PRD v5. |
| D6 | Histórico de conversa por Zetel em SQLite (`chat_messages`), não em Markdown. |
| D7 | Múltiplos arquivos por Zetel suportados desde o Módulo 3; ordem via `order_index`. |
| D8 | Cliente envia `page_id`; servidor valida contra `zetel_pages` e usa `content_text` armazenado como fonte autoritativa. Divergência registrada em `meta.page_hash_match = false`. |
| D9 | Lixeira em pasta no vault (`zetels/.lixeira/`) + flag `trashed_at` em SQLite. |
| D10 | Prompts editáveis em runtime fora do MVP (vira PRD v5); vivem em `config/prompts/` no vault. |
| D11 | Mini-índice derivado dos headings do Markdown original; persistido em `zetel_pages`. |
| D12 | Chave OpenRouter em `~/.zetel/config` (`600`). Fora do vault, código e SQLite. |
| D13 | HTML autocontido (CSS inline) gerado por `rehype`+`rehype-sanitize`. Renderização em `<iframe sandbox>`; `allow-same-origin` só se Spike B justificar. |
| D14 | Abertura de notas/memórias externa em cascata: `obsidian://open?vault=...&file=...` → copiar caminho → abrir pasta. Sem editor embutido no MVP. |
| D15 | Parceiro responde em PT-BR por padrão, independente do idioma do material. |
| D25 | Dois modos de geração de HTML por Zetel: Documento Técnico determinístico, sem LLM, fiel ao Markdown, em `artefatos/leitura-tecnica.html`; Guia de Estudo editorial com LLM, não determinístico, em `artefatos/guia-estudo.html`, `artefatos/guia-estudo.meta.json` e `artefatos/guia-estudo.source.json`. O antigo `leitura.html` deve ser migrado/renomeado para o papel técnico. |
| D26 | Pipeline editorial do Guia de Estudo: Markdown original → LLM gera JSON estruturado → template determinístico renderiza HTML. A LLM nunca gera HTML final diretamente. O JSON inclui título, subtítulo, resumo, cards, seções, glossário, quiz e perguntas Zettelkasten; cada item inclui rastreabilidade ao Markdown (`source_headings`, `source_file`, `source_block_hashes` ou equivalente). |
| D27 | Fonte de conhecimento do parceiro permanece o Markdown. O HTML visível informa localização do usuário, não limite do conhecimento do parceiro. O parceiro usa Markdown original ou `zetel_pages.content_text`; em modo Guia de Estudo, usa `guia-estudo.source.json` para mapear `guide_block_id` → origem no Markdown. D8 deve ser estendido, não substituído. |
| D28 | Configuração de modelos por tarefa (D28). **Entregue:** `study_guide_model`, `study_guide_max_tokens`, `study_guide_timeout_s`, históricos e teste por modelo. **Pendente:** `chat_model`, `note_model`, `memory_model`, `study_guide_review_model`. `tech_doc_model` persiste na UI sem uso (Documento Técnico determinístico). TTS/STT → PRD v4. | 10D/M11 (parcial) / M12 |
| DT1 | Slug do Zetel imutável após criação; `display_name` mutável; pasta no disco não é renomeada no MVP. |
| DT2 | Imagens locais copiadas para `images/` e `src` reescrito. URLs externas bloqueadas no MVP (placeholder visível). |
| DT3 | Migrations: arquivos SQL numerados em `migrations/`, aplicados via `schema_migrations`. Transação por migration. Sem down automática no MVP. |
| DT4 | Logs: só IDs e contagens em `~/.zetel/logs/`. Nenhum conteúdo de usuário. |
| DT5 | Rubrica de sugestão de nota em `config/prompts/sugestao-nota.md`; JSON inclui campo `justificativa` (interno, não exibido). |

---

## Regras invioláveis

1. **Não usar LLM no pipeline Documento Técnico**: Processar e Preparar leitura em modo técnico continuam determinísticos e sem LLM. O modo Guia de Estudo possui pipeline editorial próprio com LLM permitido, conforme D26.
2. **Não injetar CSS no iframe pelo app** — os artefatos HTML são autocontidos (CSS inline); o app só renderiza.
3. **Não confiar no `content_text` que o cliente envia no chat** — usar sempre `zetel_pages.content_text`; registrar divergência em `meta.page_hash_match = false`.
4. **Não renomear pasta física do Zetel no MVP** — slug é imutável; apenas `display_name` muda (DT1).
5. **Não cachear memória global em memória de processo** — leitura sob demanda no início de cada turno (permite edição externa no Obsidian sem inconsistência).
6. **Não logar conteúdo do usuário** — zero texto de páginas, chat, notas, memória ou chave em `~/.zetel/logs/`. Apenas IDs e contagens (DT4).
7. **Não usar pool de conexões com `better-sqlite3`** — singleton síncrono por processo.
8. **Não declarar `anchor TEXT UNIQUE` global** — unicidade é composta: `UNIQUE (zetel_id, anchor)`.
9. **Não renderizar URLs externas de imagem no MVP** — bloquear e exibir placeholder (DT2).
10. **Não loopar a ação "Discutir" em sugestão de nota** — exatamente 1 rodada de refinamento; depois reapresenta sem "Discutir" (I7).
11. **Não disparar saudação do parceiro ao reabrir chat com histórico** — saudação só quando `chat_messages` está vazio (I1).
12. **Não adicionar `allow-same-origin` ao iframe por padrão** — `<iframe sandbox>` puro até Spike B justificar (D13).
13. **Não armazenar chave OpenRouter em SQLite, vault ou git** — vive em `~/.zetel/config` com `600` (D12).
14. **Não criar editor de notas embutido no MVP** — abertura externa em cascata: `obsidian://open?vault=...&file=...` → copiar caminho → abrir pasta (D14).
15. **Não introduzir voz, internet ou prompts editáveis em runtime no MVP** — D2, D5, D10.
16. **Não renomear Zetel mexendo na pasta física** — somente `display_name`; slug físico é imutável (DT1).

---

## Plano modular

Cada módulo tem gate manual antes do próximo. Ver seção "Gates de validação entre módulos" no PRD para checklists detalhados.

| # | Módulo | Objetivo | Depende de |
|---|--------|----------|-----------|
| 0 | Spikes + mock visual | A ✅ B ✅ C ✅ D ✅ | — |
| 1 | Fundação ✅ | Next.js + vault + SQLite + settings mínimas | 0 |
| 2 | Zetel CRUD + lixeira ✅ | Entidade Zetel funcional sem conteúdo | 1 |
| **3** | **Ingestão Markdown + aba Arquivos** ✅ | Anexar `.md`, ordenar, processar, detectar drift | 2 |
| **4** | **Leitura paginada determinística** ✅ | HTML autocontido, mini-índice, navegação | 3 + mock aprovado |
| **5** | **Chat contextual com LLM** ✅ | Chat lateral, SSE, histórico, settings de modelo | 4 + Spike D |
| **6** | **Notas cooperativas** ✅ | Fluxo Guardar/Editar/Discutir/Rejeitar | 5 |
| **7** | **Memória cooperativa** ✅ | Memória global em Markdown, leitura sob demanda | 6 |
| **8** | **Polimento → MVP TEXTUAL ENTREGUE** ✅ (gate manual pendente) | Estados vazios, erros, tema, jornada completa | 1–7 |
| **9** | **Qualidade visual da leitura e do app** ✅ | PRD v3 — tipografia, KaTeX, highlight.js, Mermaid (cond.), tema, HTML-1 | 8 |
| **10A** | **Arquitetura de artefatos de leitura** ✅ | PRD v3 — separa Documento Técnico e Guia de Estudo | 9 |
| **10B** | **Redesign visual compartilhado / ajustes finos** ✅ | PRD v3 — CSS compartilhado sem injeção pelo app | 10A |
| **10C** | **Spike de guia de estudo com LLM** ✅ (GO) | PRD v3 — JSON estruturado e rastreável | 10B |
| **10D** | **Implementação do guia de estudo** ✅ | PRD v3 — `guia-estudo.html` + metadados + source map | 10C |
| **10E** | **Configuração de modelos por tarefa** ✅ (parcial; absorvido no M11/M12) | `study_guide_model` + limites do guia; restante D28 → M12 | 10D |
| **11** | **Guia de Estudo: experiência interativa** ✅ | Template interativo, schema/prompt v2, validação DFT (gate 11.4) | 10E |
| **12.0A** | **Fundação de Testes e CI** ✅ | Vitest + coverage V8 + 126 unit tests + CI GitHub Actions | 11 |
| **12.0B** | **Integration tests + E2E mock** | Harness HOME/vault temporário; E2E mock sem LLM | 12.0A |
| **12** | **Gestão completa de memória no app** | PRD v3 — ler/editar/excluir memória sem Obsidian; encerra M8-1 | 11 |
| PRD v4 | Voz, TTS e STT | PRD v4 | 12 |
| PRD v5 | Prompts editáveis e modo internet | PRD v5 | 12 |
| Futuro | Memória emergente automática | Fase futura | 12 |

---

## Contratos críticos

**Chat** (`GET`/`POST`/`DELETE /api/zetels/:id/chat`):
- POST body: `{ userMessage, pageIndex?, model? }` — `pageIndex` sincronizado via `postMessage` do iframe (`zetel:page-change`).
- Servidor busca `zetel_pages.content_text` por `page_index` (truncado 3000 chars); se índice inválido → 400.
- Resposta POST: SSE `data: <JSON string chunk>\n\n`; erro `data: [ERROR] …`.
- Histórico em `chat_messages` (`role`, `content`, `page_index`, `model`, `meta` JSON desde M6: `suggestedNote`/`noteRejected`, `suggestedMemory`/`memoryRejected`/`memoryLong`, `tokens_in`/`tokens_out`, `page_hash_match`, etc.).

**Processar** (`POST /api/zetels/:id/process`):
- Idempotente: mesmo input → mesmos `content_hash` em `zetel_files` e `zetel_pages`.
- Unicidade de anchor: `UNIQUE (zetel_id, anchor)`.

**Migrations**:
- Um arquivo SQL por migration, execução transacional, aplicação no boot via `schema_migrations`.
- Sem down automática no MVP.

---

## Workflow do dev

1. Antes de qualquer módulo: ler a seção correspondente no PRD.
2. Para mudanças não triviais: entrar em modo plano antes de escrever código.
3. Antes de declarar módulo concluído: executar o gate específico do PRD (checklists em "Gates de validação entre módulos").
4. Antes de qualquer commit: `grep` nos anti-padrões aplicáveis ao que foi implementado.
5. Ao descobrir uma nova armadilha: adicionar como item numerado na seção "Regras invioláveis" acima — este arquivo é log vivo, não snapshot.
