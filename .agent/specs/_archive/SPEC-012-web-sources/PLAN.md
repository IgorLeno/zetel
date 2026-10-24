# Plano: Fontes da web com curadoria

## Arquitetura
Ver SPEC "Arquitetura". Fluxo:
`ArquivosPanel` → `WebSourcesDialog` → `POST .../web-sources/search`
(`web-search-service` → OpenRouter plugin `web`) → candidatas → seleção →
`POST .../web-sources/import` (`web-source-service` → `safeFetch` →
`htmlToMarkdown` | PDF → `addFile` + proveniência) → Processar/Build atuais.

## Etapas de implementacao
1. Tarefa 001: importar por link. Inclui migration 011, `web-fetch`,
   `html-to-markdown`, `web-source-service`, a rota import (`urls`),
   "Adicionar por link" e "abrir original" na aba Arquivos. É vertical e
   testável sem LLM. Revisão de segurança (SSRF) antes de fechar.
2. Tarefa 002 (bloqueada por 001): pesquisar na web. Inclui
   `web-search-service` (plugin, parser de annotations, lista padrão,
   cache, teto diário), a rota search, a variante `searchId` da rota import
   com fallback de trecho e o `WebSourcesDialog` com seleção.
3. Tarefa 003 (bloqueada por 002): Configurações > Geral, com a lista
   confiável editável e o teto diário, validados no `PUT /api/settings`.

## Interfaces e dados
- Migration `011_web_sources.sql`:
  `ALTER TABLE zetel_files ADD COLUMN source_url TEXT;`
  `ALTER TABLE zetel_files ADD COLUMN source_title TEXT;`
  `ALTER TABLE zetel_files ADD COLUMN source_accessed_at TEXT;`
- `ZetelFile` ganha `sourceUrl`, `sourceTitle` e `sourceAccessedAt`
  (`string | null`).
- Import: request `{ urls: string[] }` ou
  `{ searchId: string, candidateIds: string[], allowExcerpt: boolean }`.
  Response 200
  `{ results: Array<{ status: 'ok', file: ZetelFile, extraction:
  'full'|'excerpt'|'pdf' } | { status: 'error', message: string }> }`,
  em que 400 indica entrada inválida e 404 indica `searchId`
  expirado/desconhecido.
- Search: request `{ query, openWeb }`. Response 200
  `{ searchId, candidates: Array<{ id, title, site, snippet, url,
  trusted }> }`, 429 quando atinge o teto e 503 sem chave OpenRouter.
- Settings: `web_search_domains` (JSON array) e `web_search_daily_limit`
  (inteiro 1–200), mais o contador interno `web_search_daily`
  (`{date,count}`).
- Snapshot:
  ```markdown
  ---
  source_url: "https://…"
  source_title: "…"
  source_site: "pt.wikipedia.org"
  accessed_at: "2026-10-04T12:00:00.000Z"
  extraction: full
  ---
  # Título
  …
  ```
  O frontmatter já é removido na segmentação (`stripInitialYamlFrontmatter`).
- Dependência: `hast-util-from-html@^2.0.3` direta, sem versão nova.

## Estrategia de testes
- RED → GREEN por módulo: `tests/unit/web-sources/*.test.ts`, com
  endereços, URL, html-to-markdown, annotations, allowlist e contador.
- Integração: `tests/integration/web-sources/*.test.ts`, com transport e
  resolver falsos, vault temporário, OpenRouter mockado via `fetch`
  stub e espião do logger para garantir que nenhuma URL ou tema seja logado.
- Regressão: suítes de ingestão/PDF/retrieval e `tests/unit/ui`.

## Rollout e rollback
- Gates FULL por tarefa; fast-forward em main após DONE (autorização
  permanente do Igor).
- Rollback por revert; a migration é aditiva e nullable.

## Verificacao
- Por tarefa: `pnpm exec vitest run tests/unit/web-sources
  tests/integration/web-sources` + suítes de regressão citadas na tarefa.
- `pnpm typecheck`, `pnpm test:ci`, `pnpm build`, `pnpm test:coverage`,
  `git diff --check` (sem eslint: `next lint` não funciona no projeto).
- Navegador (dev server existente na 3001): claro, escuro e mobile 375px,
  com screenshots. Chamada real de busca/página só com autorização do Igor.
