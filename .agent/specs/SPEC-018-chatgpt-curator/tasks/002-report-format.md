---
id: "002"
title: "Formato do relatorio: parser e validacao deterministicos"
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
Um relatório Markdown do ChatGPT é aceito ou recusado de forma determinística,
com motivo claro, antes de qualquer gravação.

## Perfil planejado
`STANDARD`, até uma revisão `engineering-quality`. Módulo puro novo, sem
persistência.

## Criterios de aceitacao
- `parseReport(markdown)` → `{ ok: true, meta, sections, imageRefs }` ou
  `{ ok: false, reason }` com `reason` enumerado.
- Exige `zetel_report: 1`, `zetel` (slug válido), `title`, `date` ISO; versão
  desconhecida → `unsupported_version`.
- Seções D3 reconhecidas; seção ausente não é erro; texto fora de seção vai a
  `Resumo`.
- Nomes de imagem fora de `[a-z0-9-]+\.(png|jpg|webp)` → `invalid_image_ref`.
- Exemplo de `docs/CHATGPT_REPORT_TEMPLATE.md` é fixture e passa.

## Testes
Unit com fixtures válidas e inválidas (frontmatter ausente, YAML quebrado,
versão 2, slug com `..`, imagem `.svg`, CRLF).

## Gates
STANDARD: focados, `pnpm typecheck`, `git diff --check`.

## Escopo
`lib/report-format.ts`, `tests/unit/report-format.test.ts`, fixtures.

## Riscos
Frontmatter já é tratado em `ingestao-service`; reutilizar o parser existente
em vez de outro YAML.
