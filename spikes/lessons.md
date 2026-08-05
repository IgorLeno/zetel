# Lessons — Módulo 0 (Spikes A/B/C/D)

Preenchido após execução dos spikes. Cada seção registra o que foi observado, o que foi calibrado
e o que precisa migrar para código de produto.

---

## Spike A — Pipeline remark/rehype → HTML paginado

### Calibração da paginação

| Input | Palavras (wc no .md) | Páginas geradas | Quebras dominantes |
|-------|---------------------|-----------------|-------------------|
| `curto.md` | ~518 | 3 | 2 H2 = 2 quebras; sem quebra por palavras |
| `medio.md` | ~2 626 | 9 | H1/H2 dominam; ~4 quebras por palavras (>1000w) |
| `longo.md` | ~10 633 | 41 | 13 H1 + 37 H2 = 50 possíveis; várias seções ultrapassam 1000w |

`MAX_WORDS_PER_PAGE = 1000` (padrão do spike). Para materiais acadêmicos densos,
este limite gera páginas bem equilibradas: leitura de ~3-5 min por página.
Para livros técnicos com seções longas, ajuste para 1500-2000.

### Observações técnicas

- **IDs de heading preservados**: o schema padrão do `hast-util-sanitize` tem `id` na lista
  `clobber`, o que prefixa slugs com `user-content-`. Solução: filtrar `id` do clobber.
  Isso é necessário para que o mini-índice navegue via `#slug` sem quebrar.

- **Idempotência confirmada**: dois passes em todos os 3 inputs produzem sha256 idêntico.
  Condição: `Date.now()` não é usado no pipeline; qualquer fonte de não-determinismo
  (timestamp, ordem de atributos) quebra essa garantia.

- **Imagens externas bloqueadas (DT2)**: src `http(s)://` substituído por SVG data URI
  com aviso visível antes da etapa de sanitize. O `data-blocked-src` preserva a URL
  original para inspeção. Imagens locais relativas passam sem alteração.

- **Isolamento de `<script>`**: o bloco JS de navegação é injetado diretamente no HTML
  shell, fora do pipeline sanitizado. `grep -c '<script'` nos 3 outputs retorna 1.

- **Mini-índice**: coletado do hast ANTES do sanitize, usando `unist-util-visit`.
  Headings h1-h4 com seus slugs gerados pelo `rehype-slug`. Funciona mesmo que
  `rehype-sanitize` remova atributos intermediários.

### O que migra para o Módulo 4

- Algoritmo de paginação é reutilizável com zero modificação.
- Ajustar `MAX_WORDS_PER_PAGE` via configuração no `zetel.db` (por Zetel ou global).
- O schema de sanitize customizado (sem `id` no clobber) deve ir para `lib/sanitize.ts`.
- CSS do viewer e JS de navegação do HTML autocontido viram o template de `leitura.html`.

---

## Spike B — Mock visual estático

**Status: aguardando aprovação de Igor.**

O arquivo `spike-b/mock.html` implementa:
- Sidebar 232px: logo, navegação, Zetels recentes, toggle de tema.
- Header com nome do Zetel, status badge (ok/desatualizado), botões de ação.
- 5 abas (Leitura ativa, Arquivos, Notas rápidas, Notas de literatura, Artefatos).
- Painel de leitura: mini-índice 196px + área de conteúdo em Newsreader 18px/70ch + controles de página.
- Painel de chat recolhível (380px aberto, 44px fechado): histórico, card de sugestão de nota
  com 4 botões (Guardar/Editar/Discutir/Rejeitar), contador de tokens, textarea.
- Temas claro/escuro via CSS custom properties, persistido em `localStorage`.

**Gate**: Igor precisa abrir no browser e aprovar antes de iniciar o Módulo 4.
Comando: `xdg-open spikes/spike-b/mock.html` ou abrir direto no navegador.

---

## Spike C — `better-sqlite3` no Next.js App Router

### Resultado

Singleton funcionou conforme esperado:
- `[spike-c] DB connected` aparece **exatamente uma vez** por processo, independente
  do número de requests.
- Hot-reload do Next.js (`pnpm dev`) re-importa módulos TypeScript, mas `globalThis.__zetelSpikeDb`
  sobrevive: o processo Node não reinicia, só o módulo é re-avaliado.
- 10+ requests em sequência via UI inserem 10+ linhas sem erro nem múltiplas conexões.

### Stack validada

- Node 20+ (testado em 22), Next.js 15.x, better-sqlite3 11.x, TypeScript.
- `serverExternalPackages: ['better-sqlite3']` no `next.config.ts` é obrigatório:
  sem isso o Next.js tenta empacotar o binário nativo e falha.
- pnpm 10 bloqueia build scripts nativos por padrão. Solução: `"pnpm": {"onlyBuiltDependencies": ["better-sqlite3", "sharp"]}` no `package.json`.
- `export const runtime = 'nodejs'` na rota de API é obrigatório (o Edge runtime não
  suporta `fs` nem módulos nativos).

### O que migra para o Módulo 1

- `lib/db.ts` com o padrão `globalThis.__zetelSpikeDb` vai direto para o produto.
- `serverExternalPackages` no `next.config.ts` é requisito permanente.
- A declaração `global { var __zetelSpikeDb: ... }` precisa ir para `types/global.d.ts`
  ou embutida no próprio `lib/db.ts` (spike usa a segunda opção — manter).
- `journal_mode = WAL` é o pragma mínimo; adicionar `foreign_keys = ON` no produto.

---

## Spike D — OpenRouter SSE + listagem de modelos

**Status: concluído e validado em 2026-05-29.**

Executado com modelo `anthropic/claude-3.5-haiku` via chave em `spikes/spike-d/.env`.

### Resultados

| Critério | Resultado |
|----------|-----------|
| PT-BR sem instrução no user message | ✅ Resposta inteiramente em PT-BR (instrução apenas no `system`) |
| TTFT < 5 000 ms | ✅ **1 006 ms** |
| Tokens reportados | ✅ `in=54 out=140` |
| Catálogo de modelos | ✅ 357 modelos; 249 com input < $1/1M tokens; preços coerentes |
| Streaming SSE | ✅ Sem erros; chunks chegando de forma incremental; `include_usage` funciona |

Tempo total do request: **3 739 ms**.

### Observações técnicas

- `stream_options: { include_usage: true }` funcionou: o último chunk trouxe `usage`
  com `prompt_tokens` e `completion_tokens` corretamente.
- Aviso `[DEP0040] punycode module is deprecated` emitido pelo Node.js — vem de uma
  dependência transitiva do SDK OpenAI. Não afeta o funcionamento; ignorar no produto
  (warning de runtime do Node, não do nosso código).
- Modelo default `anthropic/claude-3.5-haiku`: custo ≈ $0.80/1M input, $4.00/1M output
  (valores do catálogo OpenRouter na data da execução). Adequado para o MVP.

### O que foi validado

- [x] Resposta em PT-BR sem instrução explícita no user message (sistema instrui via `system`).
- [x] Primeiro token em < 5 000 ms (TTFT impresso ao final como `[TTFT] Xms`).
- [x] Uso impresso como `[usage] in=N out=M`.
- [x] `models` lista ≥ 5 modelos com preços coerentes (prompt $/M e completion $/M).

### Observações de design

- `stream_options: { include_usage: true }` é necessário para capturar tokens no
  modo streaming via OpenRouter. Sem isso, o último chunk não carrega `usage`.
- Na época do Spike D o default era `anthropic/claude-3.5-haiku`. **Desde 2026-06-01**
  o default do produto é `openai/gpt-4o-mini` (`lib/openrouter-constants.ts`).
  Override via `OPENROUTER_MODEL` em `~/.zetel/config` ou `default_model` em settings.
- Filtro de modelos baratos: `pricing.prompt < 0.000001` (equivale a < $1/1M tokens).

---

## Dívidas para o Módulo 1

Atalhos tomados nos spikes que precisam ser corrigidos antes de qualquer código de produto.

| # | Dívida | Spike | Regra violada | Correção no Módulo 1 |
|---|--------|-------|---------------|----------------------|
| 1 | Chave OpenRouter em env var (`OPENROUTER_API_KEY`) | D | D12 / Regra #13 | Ler de `~/.zetel/config` com permissão `600`; nunca de env var, SQLite ou git |
| 2 | Sem migrations — `CREATE TABLE IF NOT EXISTS` inline | C | DT3 | Criar `migrations/001_init.sql`; aplicar via `schema_migrations` no boot |
| 3 | `foreign_keys` não ativado no sqlite | C | Boa prática | Adicionar `db.pragma('foreign_keys = ON')` junto com WAL |
| 4 | Sem validação de input na rota de API | C | Segurança básica | Validar `page_id` contra `zetel_pages` antes de qualquer operação (D8) |
| 5 | `MAX_WORDS_PER_PAGE` hardcoded em 1000 | A | Configurabilidade | Tornar configurável por Zetel ou globalmente via `zetel.db` |
| 6 | HTML do viewer inline em `run.mjs` | A | Manutenibilidade | Separar template em `lib/viewer-template.ts` ou arquivo `.html` com slots |
| 7 | `globalThis.__zetelSpikeDb` sem tipo explícito de módulo | C | TypeScript strict | Mover declaração para `types/global.d.ts` no projeto produto |
| 8 | Nenhum log de erro persistido nos spikes | A/C/D | DT4 | No produto: erros de pipeline e de DB em `~/.zetel/logs/zetel.log` (só IDs, sem conteúdo) |

---

## Decisões impactadas pelos spikes

| Decisão | Impacto observado |
|---------|-------------------|
| D1 — pipeline sem LLM | Confirmado viável: remark+rehype entrega HTML navegável em < 1s mesmo para o input longo. Sem regressão de qualidade tipográfica. |
| D7 — múltiplos arquivos por Zetel | Algoritmo de paginação opera por arquivo; concatenação de múltiplos .md antes do pipeline é a abordagem natural (ordem via `order_index`). |
| D11 — mini-índice derivado dos headings | Coleta antes do sanitize é o ponto correto; slug do `rehype-slug` é estável e serve como âncora de navegação. |
| D13 — HTML autocontido + `<iframe sandbox>` | Spike B confirma que o layout do produto não precisa de `allow-same-origin`: o iframe é read-only, sem JS no conteúdo. Decisão mantida: `<iframe sandbox>` puro. |
| Regra #7 — singleton `better-sqlite3` | Padrão `globalThis` funciona perfeitamente com hot-reload do Next.js. Sem alternativa necessária. |

---

## Lessons — Módulo 1 (Fundação)

**Status: concluído e validado em 2026-05-29. Gate 1 → 2 OK.**

Dívidas do Módulo 0 quitadas: **#1** (chave em `~/.zetel/config` 600 via `lib/config.ts`),
**#2** (migrations em `migrations/` aplicadas via `schema_migrations` em `lib/migrate.ts`),
**#3** (`foreign_keys = ON` no `lib/db.ts`), **#7** (`globalThis.__zetelDb` tipado em `types/global.d.ts`),
**#8** (`lib/logger.ts` em `~/.zetel/logs/zetel.log`, rotação 5MB×3, só IDs/contagens).
Dívidas #4, #5, #6 permanecem para os Módulos 3/4.

### Calibração: "Testar conexão" usa /api/v1/key, não /models

[2026-05-29] Context: implementação do botão "Testar conexão" nas Configurações.
Mistake: o prompt do Módulo 1 e o spike D especificavam `GET /api/v1/models`, mas esse endpoint
é um **catálogo público** — responde `200` com qualquer chave (até `sk-or-test-FAKE-123`), logo
NÃO valida a chave. O teste passava com chave inválida.
Rule: para validar a chave OpenRouter, usar `GET /api/v1/key` (exige auth, retorna `401` com chave
inválida). `/models` só serve para listar modelos, nunca como prova de credencial válida. Vale para
o Módulo 5 (seleção de modelo: listar via `/models`, mas validar a chave via `/key`).

### Observações técnicas

- **`cookies()` no `app/layout.tsx` torna todo o app dinâmico** (render server-side por request).
  É o esperado e necessário para o tema sem `localStorage` (app roda em iframe no dev — regra #3).
  Trade-off aceito: sem páginas estáticas, mas o app é local-first single-user.
- **`PRAGMA foreign_keys` é por conexão, não persistido no arquivo.** Verificar via uma conexão
  externa (ex.: `sqlite3` CLI) sempre mostra `0`; o que importa é que `lib/db.ts` seta `ON` na
  conexão singleton do app. Não confundir auditoria externa com o estado da conexão de runtime.
- **`pnpm install` com `onlyBuiltDependencies: ['better-sqlite3','sharp']`** compila os binários
  nativos sem prompt interativo no pnpm 10 — confirmado. `sharp` veio como dep transitiva do Next.
- **Fontes via `next/font/google`** (Inter + Newsreader) são baixadas no build e self-hosted —
  bom para local-first. Expostas como `--font-inter`/`--font-newsreader`, consumidas pelos tokens
  `--font-ui`/`--font-read` do mock no `globals.css`.

---

## Lessons — Módulo 2 (Zetel CRUD + Lixeira)

**Status: concluído e validado em 2026-05-29. Gate 2 → 3 OK.**

Entregue: `migrations/002_zetel_crud.sql`, `types/zetel.ts`, `lib/zetel-service.ts`,
`lib/relative-time.ts`, rotas `app/api/zetels/**`, UI (`ZetelList`, `Modal`, `ZetelTabs`,
`ConfiguracoesTabs`, `LixeiraPanel`), rota `/zetel/[slug]`. Build com type-check estrito
limpo; lógica do serviço validada por teste de fumaça isolado (20/20 checks).

### Calibração: rotas dinâmicas no Next 15 recebem `params` como Promise

[2026-05-29] Context: implementação de `app/api/zetels/[id]/route.ts` e `[slug]/page.tsx`.
Mistake: assinar `{ params }: { params: { id: string } }` (padrão Next ≤14) faz o type-check
do `next build` falhar — no Next 15 `params` é `Promise`.
Rule: em rotas e páginas dinâmicas do App Router (Next 15+), tipar `params: Promise<{...}>`
e `const { id } = await params;`. Vale para todos os módulos seguintes (3/4/6 têm `[id]`/`[slug]`).

### Calibração: slug único é GLOBAL (inclui lixeira), não só entre ativos

[2026-05-29] Context: `generateUniqueSlug`.
Mistake: tentação de checar colisão só entre Zetels ativos (`trashed_at IS NULL`).
Rule: checar contra TODA a tabela `zetels`. Um Zetel na lixeira mantém o registro (e o slug)
reservado; permitir reuso criaria conflito ao restaurar (pasta `zetels/<slug>/` já ocupada).
A verificação `existsSync(to)` em `restoreZetel` é rede de segurança para pastas órfãs, não a
defesa primária.

### Calibração: consistência DB↔filesystem tem ordens opostas por operação

[2026-05-29] Context: trash/restore/purge/create.
Rule registrada como invariante do serviço:
- **create**: pasta ANTES, INSERT depois (pasta órfã é inofensiva; registro sem pasta seria pior).
- **trash**: DB ANTES (`trashed_at`), `fs.renameSync` depois. Se o rename falhar, o registro fica
  trashed mas a pasta segue ativa — recuperável restaurando.
- **restore**: `fs.renameSync` ANTES, limpar `trashed_at` depois. Se o rename falhar, o registro
  PERMANECE trashed — nada a desfazer. (Corrigido em patch pós-implementação: a versão inicial
  limpava o DB antes do rename, o que deixava o Zetel ativo com a pasta presa em `.lixeira/`.)
- **purge**: `fs.rmSync` ANTES, DELETE depois (pasta ausente não é fatal — pode ter sido removida à mão).
Princípio unificador: **o DB só passa a refletir o novo estado depois que o filesystem o confirma**
na direção que evita o pior estado de cada operação. `renameSync` é atômico no mesmo FS (sem cp+rm).

### Observações técnicas

- **Sem ESLint configurado no repo**: `next lint` está deprecado e cai em setup interativo.
  O gate de qualidade efetivo é `pnpm build` (compila + type-check estrito). Configurar ESLint
  fica como dívida fora do escopo do Módulo 2.
- **Teste isolado sem tsx/esbuild**: Node 22.22 roda TS via `--experimental-strip-types`, mas não
  resolve imports relativos sem extensão (convenção bundler do projeto). Um resolve-hook `.mjs` de
  ~15 linhas (`nextResolve(specifier + '.ts')` no catch) destrava isso. Importar `.ts` com extensão
  no código exigiria `allowImportingTsExtensions` no tsconfig — por isso os scripts de teste foram
  descartados após uso, para não quebrar o `next build`. `import type` (ex.: `@/types/zetel`) é
  apagado pelo strip-types e nunca precisa resolver em runtime.
- **`router.refresh()` revalida o server component**: a lista (`/zetel`) é `force-dynamic`; após
  criar/renomear/lixeira o client chama `router.refresh()` e o `useEffect([initial])` ressincroniza
  o estado local — sem reload de página, sem refetch manual.

### Dívidas pendentes (não bloqueiam o Gate)

| # | Dívida | Correção futura |
|---|--------|-----------------|
| M2-1 | Sem ESLint configurado | Adicionar config flat ESLint + script `lint` real (Módulo 9 / polimento) |
| M2-2 | Sem teste automatizado versionado | Avaliar vitest + `allowImportingTsExtensions` ou runner para regressão do serviço |
| M2-3 | Status `400` para "não encontrado" | Mapear erros do serviço para `404`/`409` adequados se a UI precisar distinguir |

---

## Lessons — Módulo 3 (Ingestão de Markdown + aba Arquivos)

**Status: concluído e validado em 2026-05-29. Gate 3 → 4 OK.**

Entregue: `migrations/003_ingestao.sql`, `types/zetel-file.ts`, `types/zetel-page.ts`,
`lib/ingestao-service.ts`, rotas `app/api/zetels/[id]/files/**` + `process`, UI
`ArquivosPanel` + badge de leitura no header. Deps: `remark`/`remark-gfm`/`unist-util-visit`
(+ `@types/mdast`/`@types/unist`). `pnpm build` limpo. Validado end-to-end num servidor
isolado (`HOME=/tmp/...`, vault em `/tmp/...`) — **nunca tocar o `~/.zetel` real do usuário
em teste**: rode com `HOME` próprio e configure `vault_path` para um diretório temporário.

### Invariante de `reading_stale` (atualizado no Módulo 4)

[2026-05-29] Context: Gate 3 — comportamento transitório.
[2026-05-29] Context: Módulo 4 — separação Processar vs Preparar leitura.
Rule: `reading_stale = 1` em mutações de arquivo, drift e **`processZetel` bem-sucedido**
(estrutura em `zetel_pages` mudou; `artefatos/leitura.html` fica desatualizado). Só
`renderZetel` (POST `/build`) seta `reading_stale = 0` e `last_built_at`. Badge verde:
`reading_stale = 0 AND last_built_at IS NOT NULL`; âmbar: `reading_stale = 1`.

### Regra #6: erro de filesystem vaza filename — nunca logar `error.message` de fs

[2026-05-29] Context: `removeFile`, `addFile`, `processImages` e os `catch` das rotas que
fazem `logger.error('...', { error: (err as Error).message })`.
Mistake: mensagens de erro do `node:fs` (EACCES, EPERM, etc.) **incluem o caminho completo**,
que contém o filename — conteúdo sensível do usuário (regra #6/DT4). A 1ª versão do erro de
arquivo ausente em `processZetel` também embutia `"${row.filename}"` na mensagem que a rota
loga.
Rule: nas operações de arquivo, (a) mensagens lançadas pelo serviço devem ser **livres de
filename** (a aba Arquivos já sinaliza o arquivo faltante via badge de drift); (b) ao logar
falha de fs, registrar só `code: (err as NodeJS.ErrnoException).code`, nunca `error.message`.
Vale para todos os módulos que mexem em arquivos do vault.

### Segmentação por arquivo + estratégia de âncora (impacta o Módulo 4)

[2026-05-29] Context: `processZetel`/`segmentFile`.
Decisão (confirmada por Igor): **nenhuma página mistura dois arquivos** — cada arquivo é
segmentado isoladamente; `page_index` é global contínuo na ordem dos arquivos. Nova página em
H1/H2 (com conteúdo acumulado) ou ao atingir `max_words_per_page` (`settings`, default 1000).
Âncora de heading = `slugify(stem-do-arquivo) + '--' + slugify(texto-do-heading)`, com dedup
intra-Zetel por sufixo `-N` (garante `UNIQUE (zetel_id, anchor)`); página sem heading vira
`pagina-<page_index-global>`. **Nota para o Módulo 4 (D11):** os ids de heading no HTML
gerado precisam **bater com estas âncoras** — o mini-índice navega por elas. Não confiar
apenas no `rehype-slug` (que geraria slugs sem o prefixo do stem); injetar/alinhar os ids com
o `anchor` persistido em `zetel_pages`.

### Sentinelas do mapa de imagens — o Módulo 4 precisa traduzi-las

[2026-05-29] Context: `processImages` + `settings.image_map_<zetelId>`.
Rule: o mapa `{ originalUrl → destino }` salvo em `settings` usa dois sentinelas em vez de um
caminho `images/...`: `__blocked__` (URL `http[s]` externa — regra #9/DT2, nunca copiada) e
`__notfound__` (imagem local referenciada mas inexistente, ou cópia que falhou). O **Módulo 4**,
ao reescrever `<img src>` no HTML, deve detectar esses sentinelas e renderizar o **SVG
placeholder** apropriado ("imagem externa bloqueada" / "imagem não encontrada") em vez de um
caminho. O nó MDAST `image` no Módulo 3 **não** é reescrito — a reescrita de `src` é tarefa do
Módulo 4 (PRD §Módulo 4).

### Observações técnicas

- **Imagens só de sintaxe Markdown (`![]()`)**: o pipeline visita nós MDAST `image`. `<img>`
  HTML embutido vira nó `html` e **não** é tratado no MVP (fica como dívida M3-3).
- **`images/` é limpo no início de `processZetel`** (`rmSync` + `mkdirSync`) para que a cópia
  seja idempotente: `resolveSemColisao` parte sempre de um diretório vazio, então reprocessar
  não acumula `imagem-2.png`, `imagem-3.png`. Páginas/hashes ficam idênticos entre passes
  (idempotência confirmada).
- **`order/` (estático) convive com `[fileId]` (dinâmico)** sob `files/` no App Router — o
  segmento estático tem precedência; `/files/order` e `/files/<uuid>` roteiam corretamente.
- **Narrowing do TS com closures**: capturar um `let x: T | null` e reatribuí-lo a `null`
  dentro de uma closure faz o TS inferir `never` no corpo do laço ("Property … does not exist
  on type 'never'"). Solução: passar o valor por argumento para os helpers (`pushPage(draft)`)
  em vez de mutar a variável capturada.
- **`addFile` copia só o `.md`, não imagens-irmãs**: a resolução de imagem em `processZetel` é
  relativa ao `.md` **dentro de `arquivos/`** no momento do Processar. Logo, imagens locais
  referenciadas precisam estar acessíveis a partir de `arquivos/` (ex.: o usuário colocá-las lá
  ou usar caminho relativo que aponte para dentro do vault). Dívida M3-1.

### Dívidas pendentes (não bloqueiam o Gate)

| # | Dívida | Correção futura |
|---|--------|-----------------|
| M3-1 | `addFile` não traz imagens-irmãs do `.md` | Avaliar ingestão de imagens junto no upload, ou orientar fluxo Obsidian (imagens já no vault) |
| M3-2 | `image_map` vive em `settings` (`image_map_<zetelId>`) | Provisório; avaliar coluna/tabela própria quando o Módulo 4 consumir o mapa |
| M3-3 | `<img>` HTML inline não tratado | Tratar nós `html` com imagem no Módulo 4 (ou bloquear explicitamente) |
| M3-4 | Páginas "heading-only" finas (H1 seguido de H2) | O Módulo 4 pode re-granularizar a paginação (PRD linha 556) |
| M3-5 | Dívida #5 do Módulo 0 (`MAX_WORDS_PER_PAGE` configurável) | Lido de `settings.max_words_per_page` no serviço; falta UI nas Configurações (Módulo 5) |

---

## Lessons — Módulo 4 (Leitura paginada determinística)

**Status: concluído em 2026-05-29. Gate 4 → 5 OK.**

Entregue: `lib/render-service.ts`, `lib/sanitize.ts`, `lib/format-utils.ts`; rotas
`build` / `leitura` / `artifacts`; `LeituraPanel` + `ArtefatosPanel`; exports em
`ingestao-service` (`segmentFile`, `listPages`, `assertZetelAtivo`, `makeAnchorFactory`).
Deps novas: `rehype-slug`, `rehype-sanitize`, `remark-rehype`, `hast-util-to-html`,
`hast-util-sanitize` (+ `@types/hast` dev). **Não** instalados: `rehype-parse`,
`rehype-autolink-headings`, `deepmerge` (schema via spread manual em `sanitize.ts`).

### `builtAt` único em `renderZetel`

[2026-05-29] Context: idempotência do HTML.
Rule: `const builtAt = new Date().toISOString()` **uma vez** no início de `renderZetel`;
a mesma string vai para `zetels.last_built_at`, `updated_at` e
`<meta name="zetel-built">`. Dois `Date.now()` no mesmo build quebrariam idempotência byte a byte.

### Mini-índice por página (não por heading interno)

[2026-05-29] Context: template `leitura.html`.
Decisão: TOC lateral lista entradas de `zetel_pages` (`heading` + `anchor`); cada
`<article id="{anchor}" class="page">` é uma página lógica. O JS navega por índice de
artigo (`show(i)`), não por `#slug` de `rehype-slug` dentro do artigo. Headings internos
mantêm ids do `rehype-slug` para links no conteúdo, mas o índice lateral é D11 ao nível
de página persistida.

### Paridade re-segmentação ↔ DB

[2026-05-29] Context: `renderZetel` passo 2.
Rule: antes de gerar HTML, re-parsear arquivos com o **mesmo** `segmentFile` + `max_words_per_page`
e validar `anchor` + `sha256(contentText) === content_hash` por índice. Divergência → erro
orientando a Processar de novo (evita HTML desalinhado do que o chat usará em `zetel_pages`).

### Placeholders de imagem

[2026-05-29] Context: `image_map_<zetelId>`.
Rule: `__blocked__` / `__notfound__` / ausente no mapa → `div.img-placeholder` (não SVG data URI
como no Spike A — texto visível conforme prompt M4). Caminhos `images/...` → `../images/...`
relativo a `artefatos/`.

### Iframe (D13)

[2026-05-29] Context: `LeituraPanel`.
Rule: `sandbox="allow-scripts"` apenas — **sem** `allow-same-origin`. O HTML autocontido
não precisa do DOM pai; isolamento máximo.

### Scroll ao trocar de página no viewer

[2026-05-29] Context: JS inline em `leitura.html`; `#reader` tem `overflow-y: auto`, `body`
tem `overflow: hidden`.
Rule: em `show(n)`, usar `document.getElementById('reader').scrollTop = 0` — **não**
`window.scrollTo(0, 0)`, que não reposiciona o container scrollável ao trocar de página
no iframe (mesmo com `allow-scripts` e sem `allow-same-origin`).

### Dívidas pendentes

| # | Dívida | Correção futura |
|---|--------|-----------------|
| M4-1 | Tema do `leitura.html` não segue cookie do app | Propagar tema via query param ou `postMessage` pós-MVP |
| M4-2 | `hast-util-sanitize` direto + `rehype-sanitize` instalado mas não usado no pipeline | Unificar em um só caminho se simplificar manutenção |
| M4-3 | M3-3 (`<img>` HTML inline) ainda sem placeholder | Estender visita a nós `html` com imagem |

---

## Lessons — Módulo 5 (Chat contextual com LLM)

**Status: implementado em 2026-05-29. Gate 5 → 6 pendente (validação manual).**

Entregue: `migrations/004_chat_messages.sql`, `types/chat-message.ts`, `lib/{chat-service,openrouter,chat-prompt}.ts`, rotas `chat` / `openrouter/test` / `settings`, `ChatPanel`, `LeituraPanel` com `postMessage`, campos de modelo e janela em Configurações.

### Ordem: comentário em `config.ts` antes de `readApiKey()`

[2026-05-29] Context: fallback `OPENROUTER_API_KEY` no ambiente para dev/CI.
Rule: atualizar doc em `lib/config.ts` **antes** de implementar `readApiKey()` em `openrouter.ts`, para o histórico git não registrar comentário “nunca env var” desatualizado.

### `stream_options` só com opt-in explícito

[2026-05-29] Context: `include_usage` no body do OpenRouter.
Mistake: enviar `stream_options: { include_usage: true }` por padrão — alguns modelos respondem 400 e o stream inteiro falha.
Rule: incluir `stream_options` **somente** se `process.env.ZETEL_LOG_TOKENS === '1'`. Log de `usage` em `try/catch` silencioso; ausência de `usage` no chunk → ignorar, sem erro.

### SSE com chunks JSON

[2026-05-29] Context: tokens do modelo podem conter `\n`.
Rule: servidor envia `data: ${JSON.stringify(chunk)}\n\n`; cliente faz `JSON.parse` — nunca colocar texto cru em linha `data:` se o chunk pode quebrar o protocolo.

### `postMessage` do iframe sem `allow-same-origin`

[2026-05-29] Context: `LeituraPanel` + `buildNavScript`.
Rule: iframe mantém `sandbox="allow-scripts"` apenas; `window.parent.postMessage({ type: 'zetel:page-change', pageIndex }, '*')` no fim de `show(n)`, preferindo `dataset.page` do `<article>`. Pai valida `e.data?.type` antes de atualizar estado.

### Teste de conexão com completion mínima

[2026-05-29] Context: `POST /api/openrouter/test`.
Rule: validar chave + modelo com `chat/completions` (`max_tokens: 1`), retornando `{ ok, model }`. `/api/v1/key` continua útil para checagem rápida de credencial, mas o botão de Configurações usa a rota nova para provar o modelo configurado. `pingChat` usa chamada **síncrona** (sem `stream: true`) — a maioria dos modelos aceita; Gemini Flash ocasionalmente retorna 400 em `max_tokens: 1`.

### `parseSseChunk` e `data: [DONE]`

[2026-05-29] Context: `ChatPanel.tsx` — parser SSE no cliente.
Rule: o servidor atual encerra o gerador em `[DONE]` **sem** reenviar `data: [DONE]\n\n` ao browser; o loop do `ReadableStream` termina em `reader.done`. Edge case frágil: proxy ou servidor futuro que emitir `data: [DONE]` faz `JSON.parse('[DONE]')` falhar — o `catch` silencioso engole a linha. **Fix previsto (M6), antes do `JSON.parse`:**
```typescript
if (payload === '[DONE]') { done = true; continue; }
```
Não bloqueia Gate 5 → 6. **✅ Aplicado no M6** — ver "SSE: buffer de linhas + `[DONE]`".

### Corrida `postMessage` na primeira carga do iframe

[2026-05-29] Context: `buildNavScript` chama `show(0)` → `postMessage`; listener em `LeituraPanel` registra no `useEffect` após montagem.
Rule: se o iframe carregar muito rápido (cache), `show(0)` pode disparar **antes** do listener — `currentPageIndex` fica `null` até o usuário trocar de página. Impacto baixo: contexto de página ausente só no primeiro envio se o usuário digitar antes de navegar; o próximo `postMessage` normaliza. Solução futura: `ChatPanel` avisar quando `currentPageIndex === null` (“Troque de página para ativar o contexto”).

### Gate 5 → 6 — pontos de atenção no teste manual

- **Item 4** (`postMessage`): no DevTools do documento **pai** (não do iframe), Console deve mostrar eventos com `type: 'zetel:page-change'` ao trocar página.
- **Item 6** (Testar conexão): confirmar modelo configurado aceita `chat/completions` síncrono com `max_tokens: 1`.
- **Isolamento**: `HOME=/tmp/zetel-test-$$` + vault temporário — **não** usar `~/.zetel` real do usuário (lesson M3).

### Dívidas pendentes (não bloqueiam o Gate)

| # | Dívida | Correção futura |
|---|--------|-----------------|
| M5-1 | Sem `meta` JSON / `page_id` / `page_hash_match` (PRD Módulo 6) | Migration + contrato D8 completo |
| M5-2 | Sem saudação automática quando histórico vazio (I1) | Módulo 6 ou polimento |
| M5-3 | Catálogo `/api/openrouter/models` com preços | PRD Módulo 5 original |
| M5-4 | `GET /api/test-connection` legado | Remover ou redirecionar para `/api/openrouter/test` |
| M5-5 | `parseSseChunk` ignora `data: [DONE]` | ✅ Resolvida (M6): guard `payload === '[DONE]'` antes do `JSON.parse` + buffer SSE — ver "SSE: buffer de linhas + `[DONE]`" |
| M5-6 | Corrida listener vs `show(0)` no iframe | Aviso em `ChatPanel` ou re-sync ao abrir chat (M6) |

---

## Módulo 6 — Notas cooperativas (2026-05-29)

### Fechamento do Gate 5 → 6 (item 7 — `chat_messages.meta`)

[2026-05-29] Context: o Módulo 5 entregou `chat_messages` **sem** coluna `meta`; o gate (item 7, PRD §13.1/§Módulo 6/D8) exige `meta` com `page_anchor`, `page_hash_match`, modelo e tokens. CLAUDE.md havia escopado isso para fora ("sem meta JSON neste módulo").
Mistake: tratar a ausência de `meta` como aceitável só porque o resumo do módulo a dispensou — PRD vence, e o Módulo 6 precisa de `meta` para `suggested_note`/`note_rejected`.
Rule: `migration 005_chat_meta.sql` faz `ALTER TABLE chat_messages ADD COLUMN meta TEXT` (idempotente via `schema_migrations`; sem down). `meta` é JSON serializado; leitura defensiva (`JSON.parse` em try/catch → `undefined`). Resolve dívida **M5-1**.

### Tokens em `meta` vs. regra #6 / dívida M5-1 do OpenRouter

[2026-05-29] Context: a lição M5 mandava enviar `stream_options.include_usage` **só** com `ZETEL_LOG_TOKENS=1` (alguns modelos dão 400). Mas gravar `tokens_in/out` em `meta` exige `usage` em todo turno.
Rule: **contagens não são conteúdo** — gravá-las em `chat_messages.meta` (SQLite) é permitido (regra #6 = "IDs e contagens"). Agora `streamChat` envia `stream_options: { include_usage: true }` **sempre** e preenche um `usageSink` mutável passado pelo chamador; `ZETEL_LOG_TOKENS` controla apenas o **log em arquivo**. Se um modelo recusar `include_usage`, o erro já cai no tratamento de erro do stream (mesma exposição que antes). Se reaparecer 400 por causa disso, reverter para envio condicional e gravar tokens só quando presentes.

### Sinalização de sugestão no stream — sentinela + buffer "held-back"

[2026-05-29] Context: o parceiro emite narrativa + bloco JSON de sugestão no mesmo completion; a `justificativa` nunca pode chegar ao cliente (nem na rede).
Rule: o prompt instrui o bloco `<<<NOTA_SUGERIDA>>> {json} <<<FIM_NOTA>>>` ao **final**. O backend acumula `fullContent` e só enfileira ao cliente o texto **antes** do marcador, **retendo um sufixo** de `len(NOTE_MARK_START)-1` caracteres a cada chunk (cobre marcador partido entre chunks). Ao detectar o marcador, para de emitir narrativa e só acumula. Pós-stream: `extractNoteSuggestion` separa narrativa (salva como `content`) da sugestão; emite `data: [SUGGESTION] <json>` (sem `justificativa`, com `messageId` p/ Rejeitar) — espelhando a convenção `[ERROR]`. JSON malformado → degrada para resposta normal (`suggestion: null`). Validado por teste de unidade puro (marcador partido não vaza; sugestão ainda extraível).

### Notas: filesystem é a fonte de verdade (sem tabela SQLite)

[2026-05-29] Context: §13.5 — Markdown no vault é canônico; SQLite é regenerável.
Rule: `lib/notes-service.ts` grava `.md` em `notas-rapidas/`/`notas-literatura/` com frontmatter §13.3 (`zetel/tipo/origem:chat/modelo/pagina_origem/criada_em`) + `# titulo` (H1) + corpo. **Sem** tabela de notas no SQLite. `listNotes`/`listNoteTitles` parseiam frontmatter (parser de linha simples — schema é escalar plano, sem dep de YAML) + primeiro H1 como título. Colisão de slug → sufixo `-2..-99`. `GET /notes/titles` alimenta o prompt p/ evitar duplicatas.

### Log de notas — não logar filename (regra #6)

[2026-05-29] Context: `note saved` logava `file=<slug>.md`; o slug deriva do título do usuário.
Mistake: o slug do arquivo é texto-adjacente ao conteúdo; `ingestao-service` já evita logar filenames de propósito ("sem filename na mensagem").
Rule: logar só `slug` (do Zetel) + `tipo` ao salvar nota. Nada de título/corpo/filename/justificativa em `~/.zetel/logs/`. Verificado por `grep` no log do teste isolado.

### "Discutir" bounded em 1 rodada (regra #10) — estado no cliente

[2026-05-29] Context: regra #10 — "Discutir" não pode loopar.
Rule: o `ChatPanel` usa `discussNextRef` (ref booleana): ao clicar Discutir, marca `true` e envia a sugestão como mensagem normal; quando a **próxima** sugestão chega, renderiza o `NoteCard` com `canDiscuss = !discussNextRef` (→ `false`) e reseta o ref. O segundo card tem só Guardar/Editar/Rejeitar.

### Abertura externa em cascata (D14) e anti path-traversal

[2026-05-29] Context: `NotasPanel` abre notas sem editor embutido (regra #14).
Rule: cascata D14 = (1) `obsidian://open?vault=<basename(vault)>&file=<relPath>`; (2) `navigator.clipboard.writeText(absPath)` + toast; (3) `POST /notes/reveal` que roda `xdg-open`/`open`/`explorer` na **pasta**. A rota `reveal` valida que `resolve(vault, relPath)` começa em `resolve(vault/zetels/<slug>) + sep` — bloqueia `../` (testado: `../../../etc/passwd` → 400).

### Rubrica `sugestao-nota.md` — self-heal sem clobber

[2026-05-29] Context: prompts vivem no vault e são editáveis pelo usuário (D10).
Rule: `SUGESTAO_NOTA_PROMPT` (rubrica §10.1) é a fonte. `ensureSugestaoNotaPrompt` escreve o arquivo **só se ausente ou ainda com o placeholder** (`<!-- Conteúdo a definir`) — nunca sobrescreve edição do usuário. `lib/vault.ts` usa a mesma constante no `initVaultStructure`, então vaults novos já nascem com a rubrica real.

### Dívidas pendentes após Módulo 6

| # | Dívida | Correção futura |
|---|--------|-----------------|
| M6-1 | System prompt do parceiro **hardcoded** em `chat-prompt.ts` (PRD pede ler de `config/prompts/parceiro.md`) | Ler `parceiro.md` no início do turno (Módulo 7/8 ou polimento) |
| M6-2 | Saudação contextual quando histórico vazio (I1) ainda ausente | Módulo 9 (estados vazios) — herda dívida M5-2 |
| M6-3 | `ChatPanel` desmonta ao recolher o painel; stream em curso é perdido (histórico persiste) | Manter montado/`display:none` se incomodar (polimento) |
| M6-4 | `pagina_origem` da sugestão vem do LLM, não é validado contra `zetel_pages` | Resolver anchor server-side a partir do `pageIndex` do turno, se necessário |

### SSE: buffer de linhas + `[DONE]` (resolve M5-5)

[2026-05-29] Context: `ChatPanel.tsx` chamava `parseSseChunk` em cada chunk bruto do `ReadableStream`.
Mistake: uma linha `data: "..."` pode chegar **partida** entre dois chunks; a metade sem `\n` falha no `JSON.parse` (descartada) e a outra metade não tem prefixo `data:` (ignorada) → texto sumido/palavras coladas. Confirmado na prática: chunks como `"nal d"`, `"a Densidad"`, `"e (DFT)"`.
Rule: acumular em `sseBuffer`; processar só até o último `\n` (`lastIndexOf('\n')`), retendo o resto; dar `flush(sseBuffer)` final ao terminar o stream. O `flush` respeita `parsed.done` (guard `payload === '[DONE]'`) e `parsed.error` (não perder `[ERROR]` no flush final). O held-back de `<<<NOTA_SUGERIDA>>>` é server-side, então o buffer do cliente não o reparte.

### `pnpm build` corrompe um `next dev` em execução

[2026-05-29] Context: rodei `pnpm build` com o `next dev` do usuário ativo na :3000.
Mistake: o build de produção reescreve `.next/` no layout de produção; o dev server passa a servir 500 com `ENOENT … .next/server/pages/_document.js`.
Rule: não rodar `pnpm build` com `next dev` vivo no mesmo `.next`. Para verificar build com o dev rodando: parar o dev → `rm -rf .next` → `pnpm build` → `rm -rf .next` → reiniciar o dev. (Alternativa futura: `distDir` separado para build de verificação.)

### E2E com Playwright (Módulo 6)

[2026-05-29] Context: suíte E2E em `e2e/` (Playwright) validando o chat real.
Rule: testes são **local-only** — dependem de OpenRouter real + um Zetel com leitura preparada (DB/vault fora do git). `E2E_ZETEL_SLUG` (via `.env.e2e`, dotenv no `playwright.config.ts`) aponta o Zetel; sem ele, helper clica no 1º card (frágil). `reuseExistingServer: true`. Specs de nota são **LLM-dependentes**: o modelo só emite `<<<NOTA_SUGERIDA>>>` com mensagem fortemente indutora ("quero MUITO guardar… inclua o bloco de sugestão") — mensagens brandas não disparam (claude-3.5-haiku é parcimonioso, fiel à rubrica). `note-save` cria nota real no vault e acumula duplicatas (sem API de exclusão, regra #14) → asserir com `.first()` e timeout generoso (troca de aba + fetch). `workers: 1` (specs compartilham o Zetel de teste).

## Módulo 7 — Memória global cooperativa (2026-05-29)

[2026-05-29] Contexto: o prompt da tarefa veio rotulado "Módulo 8", mas CLAUDE.md e PRD definem memória = Módulo 7 (Módulo 8 = Polimento).
Erro evitado: numerar entregáveis/commits/gate por um rótulo externo em vez da fonte canônica do repo.
Regra: numeração de módulo segue sempre CLAUDE.md/PRD; ao receber rótulo divergente em um prompt, confirmar com o usuário antes de codar.

[2026-05-29] Contexto: held-back da sentinela de nota no `chat/route.ts` era inline e cobria só `NOTA_SUGERIDA`.
Erro evitado: ao adicionar `MEMORIA_SUGERIDA`, esquecer de reter a segunda sentinela vazaria o bloco/justificativa no stream (regra #9), e `HOLD = NOTE_MARK.length-1` seria curto para a sentinela maior.
Regra: held-back retém o marcador que aparece mais cedo entre TODOS os marcadores (`earliestMark`), com `HOLD = max(len(marcadores)) - 1`. A narrativa salva corta no `earliestMark` (a memória pode preceder a nota no fim da resposta).

[2026-05-29] Contexto: `logger.info`/`error` aceitam só `Record<string, string|number>`.
Erro: passar `zetelOrigem: input.zetelOrigem ?? null` (string|null) quebrou o build.
Regra: campos opcionais em log → coalescer para string/number (`?? 'none'`/`?? 0`), nunca `null`. (Também reforça regra #6: log só id/contagem.)

[2026-05-29] Contexto: rotas novas precisavam do caminho do vault.
Erro evitado: `lib/paths.ts` NÃO exporta `getVaultPath` (só caminhos de `~/.zetel`). O vault vive em `getSetting('vault_path')`.
Regra: para o caminho do vault em rotas, usar `getSetting('vault_path')` com guarda de ausência (NO_VAULT 400), como nas rotas de notas.

[2026-05-29] Contexto: leitura de memória no contexto do chat.
Regra (PRD §11 / regra #5): `buildMemoryContext(vaultPath)` é chamado dentro de `buildOpenRouterMessages` a CADA POST — nunca cache de processo. Truncagem corta arquivo inteiro priorizando os mais recentes; só conta no log (`memorias_truncadas`), nunca conteúdo.

### Fechamento do Gate 7 → 8 (validado 2026-05-30)

[2026-05-30] Contexto: validação do gate apontou conflito entre a checklist do orientador ("MemoryCard não deve ter botão Discutir") e o PRD §8 (Módulo 8, linha 711: "mecanismo de proposta de memória **idêntico ao de notas**", e notas têm Discutir bounded — regra #10).
Decisão: PRD vence (regra de precedência do CLAUDE.md). O "Discutir" da memória **fica**, limitado a 1 rodada via `discussNextMemoryRef` no `ChatPanel`, espelhando o de notas. Aprovado pelo orientador no gate.
Regra: divergência checklist×PRD não se resolve em silêncio — levar ao orientador antes de gravar "gate aprovado". Os três critérios oficiais do PRD (memória editada externamente reflete; memória influencia respostas; truncagem evita estouro) não mencionam Discutir.

Resultado do gate (inspeção estática + `pnpm build` limpo): C1 leitura sob demanda PASS (`chat-prompt.ts:54-79`); C2 injeção no prompt §8.7 PASS (`chat-prompt.ts:110-130`); C3 truncagem 40%/recência PASS (`chat-prompt.ts:24-79`); C4 fluxo cooperativo PASS (frontmatter §13.4 completo; `suggestedMemory` em `meta`; `justificativa` held-back); C5 escrita atômica `wx` PASS; C6 aba `/memoria` + cascata D14 PASS; C7 logs sem conteúdo PASS.

### Pendências / atenção para teste manual (não bloqueiam o gate)
- Fluxo de sugestão/memória com LLM real exige chave OpenRouter (teste manual + `pnpm test:e2e memory-basic`) — não coberto por inspeção estática.
- Verificar: memória editada no Obsidian reflete no próximo turno sem reiniciar; memória influencia respostas; truncagem com 50+ entradas; grep regra #6 em `~/.zetel/logs/zetel.log`.
- Herdada M6-1: system prompt do parceiro ainda hardcoded em `chat-prompt.ts` (PRD pede `config/prompts/parceiro.md`). Endereçar no Módulo 8 (Polimento).

## Módulo 8 — Polimento → MVP Textual Entregue (2026-05-30)

### Dívidas fechadas neste módulo

- **M6-1 FECHADA**: `config/prompts/parceiro.md` lido sob demanda a cada turno via `ensureParceiroPrompt` (`lib/chat-prompt.ts`). Self-heal sem clobber (mesmo padrão de `sugestao-nota.md`/`sugestao-memoria.md`). Seed em `lib/vault.ts` atualizado de placeholder para `PARCEIRO_PROMPT`. Chat route passa `partnerPrompt` para `buildOpenRouterMessages`; sem vault, degrada para default embutido.
- **M6-3 FECHADA**: `ChatPanel` em `LeituraPanel` agora sempre montado — toggle de visibilidade via `style={{ display: chatOpen ? undefined : 'none' }}` em vez de render condicional `{chatOpen && <ChatPanel/>}`. Streams não se perdem ao recolher o painel.

### Dívida herdada para o próximo ciclo

- **M6-2** (saudação contextual quando histórico vazio, I1): mantida como dívida — implementar seria adicionar feature nova neste módulo de polimento. Registrar para Módulo 9 ou ciclo pós-MVP.

### Lições novas

[2026-05-30] Contexto: `readFileSync` sem try/catch na rota `/api/zetels/[id]/leitura`.
Situação: mesmo com `existsSync` antes, uma race condition (arquivo apagado entre check e read) ou erro de permissão IO retornaria 500 cru sem JSON, quebrando o contrato de erro estruturado do app.
Regra: qualquer leitura de arquivo em rotas de API deve ser envolida em try/catch, mesmo após `existsSync`. O `existsSync` não é uma garantia de sucesso do `readFileSync` subsequente.

[2026-05-30] Contexto: reads de lista (`listMemories`, `listMemoryTitles`, `listNoteTitles`) em rotas GET sem try/catch.
Situação: falha de filesystem (vault inacessível, permissão, disco cheio) causaria 500 genérico sem JSON, inconsistente com o restante do app.
Regra: envolver toda chamada de serviço em rotas GET numa try/catch com `logger.error` + resposta JSON estruturada. A convenção do app é `{ error: 'mensagem PT-BR' }`.

[2026-05-30] Contexto: cor hardcoded `#8b5cf6` para elementos de memória global no CSS.
Situação: único elemento que ignorava o tema escuro — cor não tinha variante `[data-theme='dark']`.
Regra: cores semânticas novas devem ser definidas como tokens CSS (`--memory`, `--memory-dim`) em `:root` e `[data-theme='dark']` antes de serem usadas em componentes. Nunca usar hex literal de paleta fora da seção de tokens.

### Resultado do gate 8 → release (inspeção estática + `pnpm build` limpo)
- C1 Robustez API PASS: leitura, notes/titles, memory GET, memory/titles com try/catch estruturado.
- C2 parceiro.md PASS: `ensureParceiroPrompt` em `lib/chat-prompt.ts`; leitura sob demanda; regra #5 mantida.
- C3 ChatPanel sobrevive ao toggle PASS: LeituraPanel usa `display:none` em vez de render condicional.
- C4 titles/metadata PASS: 4 rotas com `metadata`/`generateMetadata` próprios.
- C5 Loading states PASS: Remover (ArquivosPanel) e Limpar (ChatPanel) com disabled durante a requisição.
- C6 Cor memória tema-aware PASS: token `--memory`/`--memory-dim` em `:root` e `[data-theme='dark']`.
- C7 `pnpm build` limpo PASS.
- C8 Logger PASS (auditoria prévia): ≈50 call sites revisados, zero conteúdo sensível.
- Gate manual com orientador pendente antes de declarar MVP TEXTUAL ENTREGUE.

### CORREÇÃO BLOQUEANTE: memória editada externamente não refletia no próximo turno

[2026-05-30] Contexto: Gate 8 → release falhou em "Memória editada externamente é refletida no próximo turno".
Investigação: a leitura é correta — `readFileSync` e `readdirSync` em `listMemories` sempre leem o disco na hora da requisição (sem cache de processo). Node.js confirmado: conteúdo editado externamente reflete imediatamente em chamadas sequenciais de `readFileSync`.
Causa raiz: problema de semântica do prompt, não de leitura. A estrutura anterior do `buildOpenRouterMessages` produzia:
  1. `memoryRubric` (instrução: "não proponha memórias duplicadas, verifique a lista de títulos")
  2. `"Memórias já registradas (evite duplicatas):\n- título1\n- título2"` — rótulo de anti-duplicata
  3. `"Memória global do parceiro (contexto persistente entre Zetels):\n\n## título1\ncorpo1"` — conteúdo

O LLM lia "evite duplicatas" → lista de títulos → conteúdo e tendia a tratar o bloco inteiro como "memórias a não repetir em sugestões", não como "informações a usar para adaptar comportamento". Não havia instrução diretiva de uso ("USE estas informações"). O critério "memória influencia respostas" passava em inspeção estática porque o conteúdo estava no prompt, mas na prática o LLM agia como referência passiva.
Correção (`lib/chat-prompt.ts`, função `buildOpenRouterMessages`):
  - Conteúdo das memórias injetado com rótulo diretivo: `"Memória global do usuário — USE estas informações para adaptar suas respostas:"`
  - Títulos movidos para APÓS o conteúdo com rótulo restrito ao uso anti-duplicata: `"Títulos das memórias acima (para evitar sugestões duplicadas): ..."`
  - Separação semântica clara: "o que usar" vem antes, "o que não repetir em sugestões" vem depois.
Regra: quando injetar contexto persistente no prompt de um LLM, o rótulo deve ser DIRETIVO ("USE") não descritivo ("contexto persistente"). Rótulos descritivos causam uso passivo; rótulos diretivos causam uso ativo. Teste: enviar mensagem genérica e verificar se a resposta demonstra o conteúdo editado.

---

## Módulo 9 — Leitura avançada (KaTeX · highlight.js · tema)

Etapa 9.2 (implementação). Decisões do spike 9.1 aplicadas a `lib/render-service.ts`.

### remark-math é extensão de PARSE, não transformer
- O pipeline real tem DOIS processadores: a segmentação faz `parse()` (em
  `processZetel` e `renderZetel`); `pageNodesToHtml` faz `.run()` sobre os nós já
  parseados. `remark-math` só atua no `parse()`. Portanto entrou nos DOIS parsers
  de segmentação (`lib/ingestao-service.ts` e `lib/render-service.ts`), que devem
  ficar IDÊNTICOS — a paridade `anchor`/`content_hash` compara as duas segmentações.
- `mdast-util-math` (remark-math v6) grava `data.hName='code'` +
  `data.hProperties.className=['language-math','math-inline'|'math-display']` no
  nó já no parse. Por isso o `remark-rehype` do SEGUNDO processador converte os nós
  math em `<span class="math-inline">` mesmo sem `remark-math` lá, e `rehype-katex`
  (que age por classe CSS, não por tipo de nó) renderiza. Verificado por harness.
- Zetels SEM `$` produzem mdast idêntico → mesmo `content_hash` → zero regressão.
  Zetels com `$` precisam reprocessar (a paridade detecta e orienta).

### Frontmatter também é extensão de PARSE e deve ser removido antes da segmentação
[2026-05-30] Context: correção de página `[sem título]` gerada a partir de YAML frontmatter antes do H1.
Mistake: parser sem `remark-frontmatter` tratava `--- ... ---` como nós Markdown comuns (`thematicBreak`, `paragraph`, `list`) e `segmentFile` persistia isso como a primeira página.
Rule: qualquer sintaxe Markdown que muda a árvore usada por `segmentFile` deve entrar no parser compartilhado por `processZetel` e `renderZetel`; frontmatter inicial deve virar nó `yaml` e ser removido antes de segmentar.

### Backticks são código, não matemática inline
[2026-05-30] Context: nota DFT renderizava expressões como `\hat{H}`, `\Psi`, `\rho(r)`, `E[\rho]`, `N`, `3N` e `U` em caixas cinza.
Mistake: o Markdown usava backticks para variáveis/fórmulas físicas; isso cria nós `inlineCode`, que o `rehype-katex` não processa.
Rule: em notas técnicas, símbolos, operadores e fórmulas matemáticas inline devem usar `$...$`; backticks ficam reservados para código real, comandos, APIs e nomes técnicos que devem aparecer como código (ex.: família de métodos `3c`).

### Sanitize: KaTeX some em silêncio sem o subset MathML
- `appSanitizeSchema` (defaultSchema + className/id) remove `<math>`/`<mrow>`/`style`
  → equações desaparecem sem erro. Liberar: tags MathML (lista do spike +
  `annotation-xml`), `ariaHidden` em `*`, `style` só em `span`/`mstyle` (NÃO em `*`:
  seria XSS se HTML cru vazasse; o pipeline usa `allowDangerousHtml:false`).
- `rehype-highlight` NÃO precisa de extensão: emite `<span class="hljs-*">`, já
  coberto por `*`/className.

### Fontes do KaTeX precisam ser embutidas para render offline
- `katex.min.css` (23 KB) referencia `url(fonts/*.woff2)` relativo → 404 no iframe.
  Decisão do usuário: inlinar só os 20 woff2 como data: URIs (~0,35 MB no artefato).
  woff/ttf restantes ficam relativos mas nunca são buscados (browser usa o 1º
  formato suportado). Resultado: leitura.html 100% offline (Restrição #1).

### Gotcha de verificação: ESM + node_modules
- Harness `.mjs` descartável em `/tmp` falha com `ERR_MODULE_NOT_FOUND` para imports
  bare (`remark`): o ESM resolve a partir do diretório DO ARQUIVO, não do cwd.
  Rodar o harness a partir da raiz do projeto (e remover depois).

## Módulo 10C — Spike de guia de estudo com LLM (2026-05-30)

Spike isolado em `spikes/spike-10c-guia-estudo/` (deps próprias, R1: zero toque em
produção). Validou o pipeline editorial D26/D27 antes do Módulo 10D. Recomendação: **GO**.

### Rastreabilidade LLM só é confiável com catálogo de hashes pré-computado
- Pedir à LLM para "rastrear de volta ao Markdown" sem âncoras concretas convida
  alucinação de identificadores. A solução que funcionou (100% cobertura, 0 órfãos
  mesmo com `claude-3.5-haiku`): **pré-segmentar o Markdown em blocos, hashear cada
  um com `sha256`, injetar o catálogo (`block_id`/`heading_path`/`sha256`/trecho) no
  prompt e mandar a LLM COPIAR os hashes** — nunca gerá-los.
- Rastreabilidade vira **invariante verificável**, não promessa do prompt: validar
  pós-resposta que todo `source_block_hash` existe no catálogo; medir cobertura
  (% de itens com ≥1 hash válido) e contar órfãos. Levar isso para o 10D.
- Regra: para o 10D, derivar o catálogo da segmentação de PRODUÇÃO (idealmente de
  `zetel_pages.content_text` já persistido), não duplicar o parser — mantém paridade
  com o Documento Técnico e evita um segundo `content_hash` divergente.

### O texto plano que vira hash precisa de separadores entre filhos de bloco
[2026-05-30] Context: snippets de tabela/lista no catálogo saíam com palavras coladas (`célula1célula2`).
Mistake: `toPlainText` concatenava `children` sem separador, colando texto de células/itens adjacentes e degradando legibilidade do trecho injetado no prompt.
Rule: ao achatar MDAST para texto, inserir separador por tipo de pai (`tableRow`/`tableCell`/`listItem`/`paragraph` → espaço; `table`/`list` → `\n`). Em produção, qualquer hashing de texto plano deve ser deterministicamente consistente entre o catálogo e a validação.

### A LLM gera só JSON; o HTML é template determinístico (R2/D26)
- `run-guia.mjs` (LLM) produz **apenas JSON estruturado**; `run-render.mjs` gera o
  HTML por template string puro, **sem rede/LLM**. Confirmado por grep (nenhum
  `fetch`/`openrouter` em `run-render.mjs`). No 10D o template deve espelhar
  `lib/render-service.ts` (CSS inline autocontido, `<iframe sandbox>`, Regra #2).

### Paridade de chamada OpenRouter sem SDK
- O spike replicou `lib/openrouter.ts` (`fetch`, `Authorization: Bearer`,
  `HTTP-Referer: http://localhost`) e `lib/config.ts` (chave/modelo via
  env→`~/.zetel/config`). Diferença deliberada: **não-streaming** +
  `response_format: { type: 'json_object' }` para JSON único. Nem todo modelo do
  OpenRouter suporta `response_format` → manter parser tolerante a cerca ```json
  (`extractJson`) como fallback no 10D.

### Custo/dimensionamento observados
- input ~2000 palavras → catálogo de 43 blocos → prompt ~9,7k tokens (dominado
  pelo catálogo), completion ~4,0k. Para materiais grandes: truncar o `text` dos
  blocos no catálogo (já a 220 chars) ou enviar só `block_id`+`heading_path`+`sha256`,
  e dimensionar `max_tokens` por tamanho do material. Etapa LLM NÃO é determinística
  (≠ Documento Técnico); `temperature` baixa ajuda a estabilizar o JSON.

## Módulo 10D — Implementação do guia de estudo (2026-05-30)

Portou o pipeline do spike 10C para produção. Entregou `lib/source-index.ts`
(catálogo de blocos), `lib/study-guide-service.ts` (orquestração + validação +
template), `requestJson` em `lib/openrouter.ts`, branch `?mode=guia-estudo` em
`build`, `?artifact=guia-estudo` em `leitura`, e ativação do modo guia em
`LeituraPanel`. `pnpm build` limpo. Decisões/achados:

### `page_index` no catálogo resolve D27 sem tocar o chat route
- A integração D27 (parceiro em modo guia usa `source.json` → origem no Markdown)
  foi resolvida **derivando o `page_index` no render**: cada bloco do catálogo carrega
  o `page_index` da página que o contém (paridade com `zetel_pages` porque usa o mesmo
  `parseMarkdownForSegmentation`/`segmentFile`/`max_words`). O `source.json` grava
  `page_indices` por item; o HTML embute `data-page`; o guia posta `zetel:page-change`
  com o `pageIndex` real. **Resultado: o chat route não muda** — reusa D8 inteiro e a
  Regra #3 (fonte é sempre `zetel_pages.content_text`).
- Regra: ao portar segmentação para um novo consumidor, derive índices da MESMA
  função de produção; não recompute boundaries por conta própria (drift garantido).

### `source.json` é derivado server-side, nunca da LLM (R4)
- `computeTraceability` ignora os `source_file`/`source_headings` que a LLM afirma e
  reconstrói tudo a partir dos hashes que existem no catálogo (`byHash`): `source_file`,
  `heading_path` e `page_indices` saem dos blocos reais. Item com 0 hashes válidos não
  é descartado — entra com `flagged:true` (R5), visível como selo "origem não
  confirmada" no HTML.

### Reuso > reimplementação: exportar utilitários em vez de duplicar (R3)
- `sha256` e `toPlainText` viraram `export` em `ingestao-service.ts`; `source-index.ts`
  os importa. Mudança mínima, evita um terceiro `toPlainText` divergente. O catálogo de
  produção usa `toPlainText` com `join('')` (não os separadores do spike) — o que
  importa é consistência catálogo↔validação, não bater com o hash de `zetel_pages`.

### O seletor de modo é o próprio toggle de visualização
[2026-05-30] Context: 10A deixou um `mode-switch` (build) e um `artifact-switch` (view) separados.
Mistake (evitado): manter dois controles paralelos fazendo coisas parecidas confunde o usuário.
Rule: consolidei — `selectedMode` escolhe ao mesmo tempo o alvo de geração E o artefato exibido (fallback para empty-state quando o artefato do modo ainda não existe). Satisfaz o PRD ("toggle quando ambos existem") com um controle só.

### Limitações herdadas do 10C — resolvidas no M11
Ver tabela M10D-1…6 abaixo. **M10D-4** fechado em produção ao **remover** `response_format:json_object` de `requestJson` — compatibilidade por prompt ("responda só JSON") + `extractJson` tolerante a cerca ```json. O spike 10C ainda usava `response_format`; produção não.

## Módulo 10D — Dívidas (histórico → resolução no M11)

| # | Dívida | Status | Resolvido em |
|---|--------|--------|--------------|
| M10D-1 | Quiz revelava resposta antes da interação | ✅ Fechada | M11.1 — `data-answer-index`, sem `class="correta"` pré-clique |
| M10D-2 | Glossário estático sem busca | ✅ Fechada | M11.1 — filtro JS inline |
| M10D-3 | Layout linear sem sidebar | ✅ Fechada | M11.1 — `.guide-sidebar` + nav mobile |
| M10D-4 | `response_format:json_object` quebrava modelos com 400 | ✅ Fechada | Produção — sem `response_format`; prompt + `extractJson` |
| M10D-5 | Schema sem campos editoriais v2 | ✅ Fechada | M11.2 — `comparison_tabs`, `accordions`, `timelines`, `tables` |
| M10D-6 | Prompt não instruía designer instrucional | ✅ Fechada | M11.3 — `buildSystemPrompt` v2 |

### Regra registrada: quiz é pedagógico, não seguro

[2026-05-31] Contexto: proposta de usar `data-answer` com índice para "ocultar" a resposta do DOM.
Decisão: o objetivo do quiz não é segurança — é experiência pedagógica.
Regra: o índice correto pode existir no DOM para funcionamento offline, mas não deve aparecer como
texto, classe óbvia ou símbolo ✓ antes do clique. Não afirmar que "a resposta não fica legível com
DevTools aberto" — isso é falso e fora do escopo. O usuário que inspecionar o DOM pode encontrar o
índice; isso é aceitável. O que não é aceitável é a resposta visível no fluxo normal de uso.

### Regra registrada: verificação focada não deve subir servidor sem necessidade

[2026-05-31] Context: polimento M11.1 em template/script do Guia de Estudo, sem fluxo real de app.
Mistake: usar Playwright E2E para uma asserção de template fez o `webServer` tentar subir `next dev`
e bater em `EMFILE: too many open files` antes de chegar aos asserts.
Rule: para dívidas puras de template/source, preferir smoke script local em Node; reservar Playwright
para fluxos que exigem navegador, servidor ou interação real do app.

## Módulo 11.1 — Template interativo (2026-05-31)

Evoluiu `renderStudyGuideHtml` / `guideCss()` / `guideNavScript()` em `lib/study-guide-service.ts`
sem alterar o schema v1 obrigatório nem o prompt da época.

### Entregue
- Sidebar sticky (desktop) com links para Capa, Cards, Seções, blocos v2 (quando existem),
  Glossário, Quiz, Zettelkasten; nav compacta no topo em mobile.
- Highlight da seção ativa via extensão do `IntersectionObserver` existente (um observer só).
- Quiz pedagógico: botões `.quiz-option`, `data-answer-index`, feedback pós-clique, pontuação,
  botão reiniciar; sem revelar resposta no fluxo normal.
- Glossário pesquisável: `<input id="glossary-search">` filtra termo e definição inline.
- `.trace` e `data-page` / `postMessage zetel:page-change` preservados.

### Gate 11.1
`pnpm build` limpo. Validação visual completa adiada para gate 11.4 (Zetel DFT).

## Módulo 11.2 — Schema editorial v2 (2026-05-31)

Campos opcionais em `StudyGuideJson`: `comparison_tabs`, `accordions`, `timelines`, `tables`.
`validateAndNormalize` não falha pela ausência; `renderV2Blocks` renderiza se presentes.
Aliases tolerantes: `tabs ?? tabelas`, `etapas ?? steps` (fixtures/smoke).

### Pontos de atenção pós-implementação
- `renderAccordions` renderiza `.trace` fora do `<details>`, preservando o selo visível
  independentemente do estado recolhido. Recuo visual pode desalinhar em telas estreitas — tratar
  como ajuste cosmético na validação visual 11.4.
- Ordem fixa em `renderV2Blocks`: `comparison_tabs` → `accordions` → `timelines` → `tables`;
  sidebar espelha após Seções e antes de Glossário. Ordenação editorial customizável: fora de escopo.

## Módulo 11.3 — Prompt editorial v2 (2026-05-31)

`buildSystemPrompt` instrui a LLM como **designer instrucional**: papel editorial, blocos v2
opcionais (só quando o documento justificar), rastreabilidade obrigatória também nos blocos v2,
schema inline com comentários de opcionalidade (não incluídos no JSON final).

### Gate 11.3
Implementação em código concluída; gate manual com guia DFT real (visual + rastreabilidade) integrado
ao **gate 11.4**.

## Módulo 11.4 — Validação Zetel DFT (2026-05-31)

Gate **11 → 12 aprovado**. Zetel `dft`, modelo `deepseek/deepseek-v4-flash`, 244 s, 41 767 tokens
(28 110 prompt / 13 657 completion), HTML ~51 KB. Meta: 6 cards, 5 seções, 8 glossário, 6 quiz,
5 zettelkasten; `coveragePct` 100%, 0 órfãos, 0 flagged. Quatro blocos v2 (1 de cada tipo), todos
com hashes válidos. Invariantes HTML OK: quiz sem vazamento de resposta, glossário pesquisável,
sidebar v1+v2, `.trace` em 35 itens, offline (0 CDN), 40× `data-page`. `pnpm build` limpo.

### Calibrações

- **Reprocessar antes de gerar guia:** Zetel `dft` ainda tinha 28 páginas no SQLite (pipeline antigo +
  artefato legado `leitura.html`). `POST /process` reescreveu para 27 páginas (paridade com `dft2`) e
  desbloqueou a checagem em `study-guide-service.ts`. Rule: guia de estudo exige `zetel_pages` alinhado
  à segmentação atual — reprocessar se o Zetel foi ingerido antes de mudanças de parser/paginação.
- **Blocos v2 dependem de conteúdo + modelo, não só de prompt:** run anterior com zero v2 atribuiu
  "lacuna de prompt"; após reprocessamento, o mesmo prompt 11.3 + DeepSeek emitiu comp/acc/time/table
  justificados pelo material DFT. Escalonamento de endurecimento de prompt (plano passo 9) **não**
  acionado.
- **Rastreabilidade:** 100% cobertura no run final; pendência anterior de glossário 100% flagged foi
  operacional (fonte desatualizada), não regressão de validador.
- **Compat retroativa v1:** não testada — sem guia pré-v2 no vault (só `leitura.html` técnico). Coberta
  por desenho (`renderV2Blocks` omite seções vazias). Ressalva não-bloqueante.

### Gate 11.4
Aprovado sem alteração de código; apenas reprocessar, restaurar `study_guide_model` e regenerar.

## Correção pós-M11 — Chat no Guia de Estudo (2026-05-31)

[2026-05-31] Context: perguntas feitas enquanto o Guia de Estudo estava aberto terminavam sem resposta visual.
Mistake: o route de chat salvava `assistant.content = ""` quando a LLM emitia sentinelas de nota/memória antes de qualquer narrativa, e o `ChatPanel` renderizava essa mensagem vazia como bolha normal.
Rule: nunca persistir nem renderizar bolha de assistant vazia; se houver sugestão sem narrativa, salvar e emitir um fallback curto; se o stream terminar sem texto e sem sugestão, emitir erro SSE claro e manter o histórico sem assistant vazio.

[2026-05-31] Context: o parceiro recebia só `pageIndex`, mas o usuário navegava no Guia de Estudo, cujo bloco visual não é igual à página Markdown.
Mistake: tratar `data-page` como suficiente para perguntas de localização no Guia.
Rule: o Guia deve postar `zetel:page-change` com `readingMode:"guia-estudo"`, `pageIndex`, `guideBlockId`, `guideSectionId` e título quando disponível; o backend usa `guia-estudo.source.json` só para localização/rastreabilidade, mantendo `zetel_pages.content_text` como fonte principal de conhecimento.

[2026-05-31] Context: clicar links internos da sidebar do Guia em iframe sandbox podia gerar tentativa insegura de navegação para URL absoluta.
Rule: links internos continuam como fragmentos relativos (`href="#..."`), mas o script do Guia intercepta o clique, chama `scrollIntoView` e atualiza o estado via `postMessage`, sem relaxar `sandbox="allow-scripts"`.

## Default OpenRouter (2026-06-01)

[2026-06-01] Context: `anthropic/claude-3.5-haiku` era o fallback em `getOpenRouterModel()` e em spikes; custo-benefício inferior a `openai/gpt-4o-mini` para chat/guia.
Rule: fonte única em `lib/openrouter-constants.ts` (`DEFAULT_OPENROUTER_MODEL = openai/gpt-4o-mini`). `getOpenRouterModel()`, UI (placeholder), E2E live (`.env.e2e.live.example`) e spikes `run.mjs` alinhados. Quem já tem `OPENROUTER_MODEL` no `~/.zetel/config` não é alterado automaticamente.

## Módulo 13.4 — Dois toggles ortogonais de voz (2026-06-02)

[2026-06-02] Context: 13.3 entregou voz com modelo implícito: ▶ por mensagem (TTS avulso) + mic que sempre auto-enviava com mode='voice' e tocava TTS.
Mistake: o usuário não conseguia controlar entrada e saída de voz de forma independente (ex: digitar e ouvir a resposta, ou falar e ler).
Rule: Dois toggles ortogonais explícitos (`inputMode × outputMode`). `interactionMode` e auto-TTS derivam **somente de `outputMode`** (`audio` → `'voice'` + TTS; `text` → sem TTS). `inputMode` controla **apenas** se o mic 🎙 aparece. Isso elimina o botão ▶ por mensagem e o mode param de `sendMessage`, centralizando a regra em um único lugar.

[2026-06-02] Context: tentativa inicial usava setters funcionais (`setInputMode(prev => ...)`) no useEffect de degradação.
Mistake: setters funcionais não têm acesso ao outro estado simultaneamente, tornando impossível chamar `saveVoicePrefs(im, om)` com os dois valores pós-degradação.
Rule: para o effect de degradação, ler ambos os estados da closure diretamente (são corretos porque voiceStatus chega async, depois do useEffect de localStorage); calcular os valores degradados em variáveis locais antes de qualquer setState; chamar `saveVoicePrefs` uma única vez com os valores finais.

[2026-06-02] Context: deixei um useEffect com corpo vazio intencional como "placeholder" para persistência pós-degradação.
Mistake: corpo vazio = lógica que nunca roda. A persistência não ocorria após degradação.
Rule: nunca deixar useEffect com corpo vazio como placeholder. Se a lógica não cabe no efeito atual, consolidar antes de commitar.

### Fechamento do Gate 13.4 (aprovado em 2026-06-02)

[2026-06-02] Context: validação final da etapa de polimento de voz com base nos commits `00b4e94` → `da4886e`.
Resultado: Gate 13.4 aprovado com os critérios centrais cumpridos — contrato `interactionMode` ativo no chat, STT/TTS dedicados em rotas próprias, chip de voz com toggles ortogonais (`inputMode × outputMode`), persistência em `localStorage`, fallback textual preservado em falha de áudio, interrupção de reprodução concorrente e limpeza de `createObjectURL`.
Regra: para futuras evoluções de voz, manter os dois eixos independentes (entrada e saída) e evitar retorno ao modelo implícito por ação isolada (ex.: botão TTS por mensagem), que gera estado difícil de prever.

## Pós-M14 — Sobreposição de áudio TTS por callbacks órfãos (2026-06-03)

[2026-06-03] Context: em `hooks/useTtsQueue.ts`, com `autoPlay` ON, enviar nova mensagem enquanto o parceiro falava deixava dois áudios tocando ao mesmo tempo. O guard de geração (`genRef`) parecia suficiente, mas não era.
Mistake: o `cleanup` de `playUrl` zerava `audioRef.current` e `stopCurrentRef.current` **sem checar posse**. Um `audio.play().catch()` atrasado de um turno superado disparava depois que o áudio do turno seguinte já estava instalado, apagando as referências do áudio novo — então o `cancel()` posterior não conseguia pará-lo e ele tocava sobre o turno atual. (`currentUrlRef` já tinha guard `=== url`; `audioRef`/`stopCurrentRef` não.)
Rule: callbacks assíncronos que mutam refs compartilhadas devem ser **idempotentes** (flag `settled`) e **guardados por identidade da instância** — só limpar `audioRef.current`/`stopCurrentRef.current`/`currentUrlRef.current` se ainda apontarem para a instância/handler/URL daquele áudio. O handler de stop deve capturar seu próprio `audio` na closure e pausar essa instância, nunca depender de `audioRef.current` externo (que pode já ter sido substituído). Guard de geração impede *criar* áudio obsoleto; guard de identidade impede um callback obsoleto *destruir* o áudio que o sucedeu — ambos são necessários.

## M14.4-patch — Sobreposição de áudio dentro do mesmo turno (2026-06-03)

[2026-06-03] Context: mesmo dentro de um único turno (sem `cancel()`), uma resposta com 5 frases podia gerar 5 blobs simultâneos ("media ativa" no DevTools), todos tocando ao mesmo tempo.
Mistake: `finish()` resolvia a promise da cadeia serial mas nunca chamava `audio.pause()`. Quando `audio.play()` era rejeitado pelo navegador (sucessão rápida de blobs, quirks de autoplay), a cadeia avançava para a próxima frase mantendo o elemento `audio` anterior vivo — navegadores podem iniciar playback após uma promise `play()` rejeitada, então o áudio antigo soava em paralelo com o novo.
Rule: **sempre chamar `audio.pause()` + desanexar handlers em `finish()`**, independentemente do caminho que o liquidou. Isso garante que o nó anterior está comprovadamente mudo antes de a cadeia avançar. Adicionalmente, diferenciar rejeição *espúria* de `play()` (o áudio toca apesar do reject: `!audio.paused && !audio.ended → aguardar onended`) de bloqueio *real* (autoplay negado: `audio.paused === true → finish()`). A verificação elimina o avanço prematuro sem introduzir retry ou timers.

## Pós-M14 — Layout de leitura e parceiro (2026-06-03)

[2026-06-03] Context: correções visuais pós-M14 no shell de leitura precisavam remover controles da toolbar, fazer o iframe ocupar o espaço disponível e manter o parceiro montado.
Mistake: acoplar estado visual de leitura (status, regenerar, seção atual) à área que deveria ser só canvas de leitura reduzia espaço útil e criava competição de scroll/layout com o chat.
Rule: correções de layout no shell devem preservar contratos comportamentais (`ChatPanel` montado, payload de chat, voz/TTS) e mover contexto/progresso para canais dedicados (`ReadingProgress`/`postMessage`), mantendo a área de leitura como flex container simples com iframe e painel lateral.

[2026-06-03] Context: sugestões de nota dependem do `ChatPanel` continuar montado e participando do layout lateral enquanto o painel do parceiro abre/fecha.
Mistake: usar `display:none` ou `display:contents` no wrapper do parceiro preservava a instância React, mas quebrava o layout/semântica necessários para o painel lateral e suas sugestões.
Rule: para preservar `ChatPanel` montado no layout lateral, não esconder seu wrapper com `display:none` nem achatar com `display:contents`; recolher via largura zero, overflow controlado, `inert` e `aria-hidden`.

[2026-06-03] Context: o usuário pedia explicitamente "faça uma nota", mas o backend aceitava que o modelo respondesse em texto livre sem emitir `<<<NOTA_SUGERIDA>>>`.
Mistake: a rubrica de nota ensinava o formato, mas não tornava o marcador obrigatório para pedidos explícitos de criação de nota; sem marcador, o stream não gera `[SUGGESTION]` e o `NoteCard` não renderiza.
Rule: quando o usuário pedir uma nota explicitamente e houver contexto suficiente, o prompt backend deve exigir o bloco `<<<NOTA_SUGERIDA>>> ... <<<FIM_NOTA>>>`; texto livre do tipo "preparei uma sugestão" nunca é resposta válida para renderização de cartão.
