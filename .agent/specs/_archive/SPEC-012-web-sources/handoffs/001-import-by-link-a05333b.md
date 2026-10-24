---
task_id: "001"
delivery_commit: a05333be39807292d1c55332b699537a437cf8f1
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-07T14:09:31.076Z
---

# Handoff 001 — Importar fonte da web por link

## Tarefa

- ID: 001
- Perfil: FULL, reviews_requested: 1 (engineering-quality)
- Fechamento de sessao feito no inicio da sessao da 002, porque
  `session close` (tarefa 005 da SPEC de workflow) ainda nao existe.

## Entregue

- Migration 011: `source_url`, `source_title`, `source_accessed_at`
  (nullable) em `zetel_files`; `ZetelFile` expoe os tres campos.
- `lib/web-fetch.ts`: `safeFetch` com SSRF completo (IP validado,
  redirects manuais revalidados, limites apos descompressao, timeout 15 s),
  `resolver`/`transport` injetaveis.
- `lib/html-to-markdown.ts`: HTML -> Markdown deterministico sem LLM.
- `lib/web-source-service.ts`: `importWebSource`, `WebSourceError`,
  `MIN_TEXT_CHARS = 200`.
- Rota `POST /api/zetels/[id]/web-sources/import` com `{ urls }` (1-5).
- `ArquivosPanel`: "Adicionar por link" e "abrir original".

## Gates

- `evidence/001-validation.json`: PASS (focused, build, test:ci, coverage,
  typecheck, diff-check).

## Revisoes

- `reviews/001-engineering-quality.md`: PASS, 4 rodadas.
- Abertos e fora do escopo da 002: F005 (recursao sem limite em HTML
  hostil), F006 (rota aceita POST `text/plain`), F007 (redirect https->http
  seguido).

## Proximo

- Tarefa 002: pesquisar na web por tema e importar candidatas.
