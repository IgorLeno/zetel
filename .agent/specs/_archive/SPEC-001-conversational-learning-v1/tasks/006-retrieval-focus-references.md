---
id: "006"
title: "Retrieval, foco por linguagem natural e referências"
status: SESSION_CLOSED
blocked_by: ["003", "005"]
writer: null
reviewer: null
commit: 472cdd9d42aed3fb1df79df3dcbc37efc6b9a637
push: "origin/main (PR #23 merge 4092173f39b87f1973ba97b9cbf7c1ad633dd574)"
review_result: NOT_RUN
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/006-retrieval-focus-472cdd9.md
execution_profile: FULL
profile_justification: "Nova tabela FTS5 derivada, mudança no contrato de prompt/SSE e mitigação de prompt injection."
validation: PASS
validated_at: "2026-09-27T12:58:34.501Z"
---

## Objetivo

Dar à parceira acesso ao Zetel inteiro por recuperação lexical, com foco alterável por linguagem natural e referências clicáveis.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Nova tabela FTS5 derivada, mudança no contrato de prompt/SSE e mitigação de prompt injection.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- `passages_fts` (re)construída no processamento a partir de `pdf_pages` e `zetel_pages`.
- `retrievePassages(zetelId, query, focus)` retorna top-k com BM25, excluindo o foco; orçamento do PLAN respeitado.
- Regras PT-BR de foco (página/seção/documento/começo/fim) persistem `focus` na sessão.
- Fontes numeradas `S1..Sn` por turno; evento `[SOURCES]` com documento/página; `[fonte:ID]` desconhecido removido da UI.
- Chip `Documento · p. N` com `[Ir até a página]` no leitor.
- System prompt exige citar fontes e declarar falta de suporte; sem web.
- Testes de injeção: instrução dentro de fonte não altera sentinelas nem perfil.

## Testes

Unit: parser de foco, montagem de contexto com orçamento, filtragem de citações. Integração: FTS5 com fixture, chat mockado emitindo `[SOURCES]`.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `migrations/008_*.sql`, `lib/retrieval-service.ts`, `lib/focus.ts`, `lib/chat-prompt.ts`, rota de chat, componentes de referência.

Fora de escopo: Embeddings, busca web, conceitos no contexto (entram em 011).

## Riscos

Qualidade lexical em PT-BR (stemming ausente); limitar e medir com fixture.
