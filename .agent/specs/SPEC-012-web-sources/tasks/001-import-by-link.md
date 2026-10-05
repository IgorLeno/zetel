---
id: "001"
title: "Importar fonte da web por link"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Migration, nova superficie de rede (SSRF), rota publica e escrita no vault"
validation: PASS
validated_at: "2026-10-05T06:27:37.973Z"
---

## Objetivo
Aplicar RF1–RF4, RNF1–RNF5, D3 e D4. O usuário cola até 5 URLs públicas na
aba Arquivos, e o servidor baixa com segurança e grava um snapshot `.md`
(ou o PDF) com proveniência, que segue o pipeline atual.

## Criterios de aceitacao
- Migration 011 aplica 3 colunas nullable; `ZetelFile` expõe
  `sourceUrl`, `sourceTitle` e `sourceAccessedAt`.
- `isPublicAddress` bloqueia loopback, RFC1918, CGNAT, link-local/metadata,
  `0.0.0.0/8`, multicast/reservados, `::1`, `::`, `fc00::/7`, `fe80::/10`
  e IPv4-mapped privados. `assertPublicUrl` recusa esquema diferente de
  http(s), porta diferente de 80/443 e userinfo.
- `safeFetch` conecta no IP validado, revalida cada redirect (máx. 5),
  aborta em 15 s, limita HTML a 5 MB e PDF a 50 MB após descompressão e
  recusa content-type fora da allowlist e 401/402/403/407/451.
- HTML vira Markdown com frontmatter (`source_url`, `source_title`,
  `source_site`, `accessed_at`, `extraction: full`) e `# título`, sem
  script/style/nav/imagens. Menos de 200 caracteres de texto gera erro
  "sem texto extraível".
- Um PDF público entra como `.pdf`, e Processar gera `pdf_pages`.
- Um `.md` importado e processado gera `zetel_pages`. Documento Técnico e
  Guia não mudam de código.
- `POST .../web-sources/import { urls }` aceita de 1 a 5 URLs e devolve
  um resultado por URL. As mensagens de erro e os logs não contêm URL,
  domínio, título nem conteúdo.
- A aba Arquivos ganha "Adicionar por link" e, nos arquivos com
  `sourceUrl`, o site e o link "abrir original" (`noopener noreferrer`).
  Funciona em claro, escuro e mobile 375px.

## Testes
- `tests/unit/web-sources/web-fetch-address.test.ts`,
  `tests/unit/web-sources/html-to-markdown.test.ts` (novos).
- `tests/integration/web-sources/safe-fetch.test.ts`,
  `tests/integration/web-sources/import-route.test.ts` (novos; transport
  e resolver falsos, vault temporário, espião de logger).
- Regressão: `tests/integration/ingestao`, `tests/integration/pdf`,
  `tests/unit/ingestao`.

## Gates
- FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
  `pnpm test:coverage`, `git diff --check`. Também 1 revisão independente
  (engineering-quality, foco em SSRF/limites) e validação no navegador com
  uma URL real somente com autorização do Igor.

## Escopo
- `migrations/011_web_sources.sql`, `types/zetel-file.ts`,
  `lib/ingestao-service.ts` (mapeamento das colunas e proveniência),
  `lib/web-fetch.ts`, `lib/html-to-markdown.ts`,
  `lib/web-source-service.ts`,
  `app/api/zetels/[id]/web-sources/import/route.ts`,
  `components/ArquivosPanel.tsx`, `app/globals.css` (se necessário),
  `package.json`/`pnpm-lock.yaml` (dependência direta
  `hast-util-from-html`), testes.

## Riscos
- SSRF/DNS rebinding: conexão no IP validado + revalidação por redirect.
- Página gigante/zip bomb: limite após descompressão.
- Páginas SPA sem texto: erro claro. O fallback de trecho só vem na 002.
