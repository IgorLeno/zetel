---
id: "002"
title: "Ingestão de PDF preservando páginas"
status: SESSION_CLOSED
blocked_by: ["001"]
writer: null
reviewer: null
commit: 4e3d1c454c54d6b3ec7945ac0470bc7817bf6f57
push: origin/feat/spec-001-task-002-pdf-ingest
review_result: PASS
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/002-pdf-ingest-4e3d1c4.md
execution_profile: FULL
profile_justification: "Migration 006 nova (pdf_pages/pdf_sections + colunas em zetel_files), dependencia nova pdfjs-dist, parsing de entrada nao confiavel (PDF) e persistencia de derivados: FULL por regra."
validation: PASS
validated_at: "2026-09-26T13:56:03.603Z"
---

## Objetivo

Aceitar PDF como material do Zetel, preservar o original no vault e extrair texto por página (e outline) para tabelas derivadas com hash.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Migration nova, dependência nova (`pdfjs-dist`) e persistência de derivados: FULL por regra.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Upload `.pdf` aceito; `.md` continua funcionando; outros formatos rejeitados.
- Original copiado sem alteração para `arquivos/` (hash do arquivo igual ao enviado).
- `pdf_pages` com uma linha por página (1-based), `content_hash` sha256 e `char_count`.
- `pdf_sections` preenchida a partir do outline quando existir.
- `zetel_files.page_count`/`extraction_status` (`ok`, `no_text`, `failed`); PDF sem texto marcado `no_text` sem quebrar o processamento.
- Reprocessamento idempotente; remover arquivo remove derivados (CASCADE).
- Extração ignora JavaScript/anotações ativas do PDF; nada do PDF é executado.
- Logs só com IDs/contagens (páginas, bytes).

## Testes

Unit: extração da fixture PDF (3 páginas + outline), hashing, status `no_text`. Integração: migration sobre banco com dados, upload + process + remoção.

## Gates

Testes focados; `pnpm build`; `pnpm test:ci`; `pnpm test:coverage`; `pnpm typecheck`; `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: `migrations/006_*.sql`, `lib/pdf-service.ts`, `lib/ingestao-service.ts`, `app/api/zetels/[id]/files/route.ts`, `package.json`, `tests/`.

Fora de escopo: Leitor PDF, chat, retrieval, OCR.

## Riscos

Compatibilidade do build legacy de pdfjs-dist em Node/Next; tamanho do bundle; PDFs grandes (limite de tamanho documentado).
