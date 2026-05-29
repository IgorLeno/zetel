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

**Status: aguardando execução com chave real do usuário.**

O script `spike-d/run.mjs` está pronto. Para validar, o usuário deve executar:

```bash
cd spikes/spike-d

# Chat com streaming SSE
OPENROUTER_API_KEY=sk-or-... node run.mjs chat

# Listagem de modelos (top 10 mais baratos)
OPENROUTER_API_KEY=sk-or-... node run.mjs models
```

### O que validar

- [ ] Resposta em PT-BR sem instrução explícita no user message (sistema instrui via `system`).
- [ ] Primeiro token em < 5 000 ms (TTFT impresso ao final como `[TTFT] Xms`).
- [ ] Uso impresso como `[usage] in=N out=M`.
- [ ] `models` lista ≥ 5 modelos com preços coerentes (prompt $/M e completion $/M).

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
