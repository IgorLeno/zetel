---
id: "002"
title: "Pesquisar na web e importar candidatas"
status: DRAFT
blocked_by: ["001"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Aplicar RF5, RF6, RF8, RF9, D1, D2 (com a lista padrão), D5 e D6. Um tema
vira até 8 candidatas; o usuário escolhe até 5 e importa, com fallback de
trecho.

## Criterios de aceitacao
- `POST .../web-sources/search { query, openWeb }` valida a query
  (2–200 chars) e chama o OpenRouter uma única vez com `plugins: [{ id:
  'web', engine: 'exa', max_results: 8, include_domains }]`
  (`include_domains` é omitido quando `openWeb=true`).
- O parser de `message.annotations[].url_citation` deduplica por URL
  normalizada, aceita só http(s), corta o snippet em 300 chars e marca
  `trusted` pela lista (curingas `*.gov`, subdomínios). O resultado tem no
  máximo 8 candidatas e é tolerante a annotations ausentes.
- O cache em processo por Zetel guarda `searchId` → candidatas por 30 min.
  Import `{ searchId, candidateIds (1–5), allowExcerpt }` resolve as URLs
  pelo cache. `searchId` desconhecido ou expirado retorna 404, e o cliente
  nunca fornece o trecho.
- Se o download falha e `allowExcerpt=true`, o servidor grava um snapshot
  com `extraction: excerpt` a partir do trecho do cache.
- O teto diário (padrão 20) responde 429 sem chamar o OpenRouter. Sem
  chave, a rota responde 503 com mensagem clara. O contador só guarda
  data e contagem.
- `WebSourcesDialog` oferece campo de tema, toggle "web aberta",
  lista com checkbox (título, site, resumo, link, selo "lista confiável"
  ou "fora da lista") e botão "Importar selecionadas (n)", desabilitado com
  zero ou mais de 5 marcadas, mais o resultado por item. Funciona em
  claro, escuro e mobile 375px.
- Nenhum log, mensagem de erro ou persistência contém tema, URL, título
  ou trecho.

## Testes
- `tests/unit/web-sources/search-annotations.test.ts`,
  `tests/unit/web-sources/allowlist.test.ts`,
  `tests/unit/web-sources/daily-budget.test.ts` (novos).
- `tests/integration/web-sources/search-route.test.ts` (novo; `fetch`
  do OpenRouter mockado, 429, 503, cache, trecho, espião de logger).
- Regressão: `tests/integration/web-sources` da 001.

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`. Também 1 revisão independente
  (spec-compliance). Para validar no navegador com busca real, é preciso
  autorização explícita do Igor (custo ≈ US$ 0,007 + tokens por busca).

## Escopo
- `lib/web-search-service.ts`, `lib/web-source-service.ts` (variante
  candidata/trecho), `app/api/zetels/[id]/web-sources/search/route.ts`,
  `app/api/zetels/[id]/web-sources/import/route.ts`,
  `components/WebSourcesDialog.tsx`, `components/ArquivosPanel.tsx`,
  `app/globals.css` (se necessário), testes.

## Riscos
- Mudança de formato do plugin: parser tolerante + mensagem de zero
  resultados.
- Custo: teto diário e nenhuma chamada real em testes.
- Cache em processo se perde ao reiniciar o servidor: 404 claro pede
  nova busca.
