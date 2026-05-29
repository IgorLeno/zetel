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
- O modelo default `anthropic/claude-3.5-haiku` foi escolhido por custo-benefício.
  Overrideable via `OPENROUTER_MODEL` env var.
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

### Invariante de `reading_stale` (correção obrigatória do plano)

[2026-05-29] Context: `processZetel`.
Rule: `processZetel` bem-sucedido seta `reading_stale = 0` **e** `last_built_at = now` — não
`= 1`. `reading_stale = 1` é marcado **só nas mutações** (`addFile`/`removeFile`/`reorderFiles`)
e na detecção de drift em `listFiles`. O badge verde "Leitura atualizada" depende de
`reading_stale = 0 AND last_built_at IS NOT NULL`; o âmbar "Leitura desatualizada" de
`reading_stale = 1`. (O texto do prompt original do Módulo 3 dizia marcar `=1` ao final do
processo e o gate falava em badge âmbar após Processar — ambos foram **corrigidos** por Igor:
após Processar o estado correto é "atualizada".)

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
| M3-5 | Dívida #5 do Módulo 0 (`MAX_WORDS_PER_PAGE` configurável) | Lido de `settings.max_words_per_page` no serviço; falta UI nas Configurações (Módulo 4/5) |
