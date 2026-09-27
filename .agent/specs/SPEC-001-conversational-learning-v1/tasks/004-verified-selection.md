---
id: "004"
title: "Seleção verificada: Conversar sobre isto"
status: SESSION_CLOSED
blocked_by: ["003"]
writer: null
reviewer: null
commit: fc2f9f3043365f4ae9fd4533fa8095a024c00761
push: "origin/main (merge 643283d33727d006a7269a897cc07e96fc243ec4, PR #17)"
review_result: NOT_RUN
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/004-verified-selection-fc2f9f3.md
execution_profile: FULL
profile_justification: "Contrato de confiança cliente→servidor da seleção: texto do cliente só vale se for substring normalizada de pdf_pages.content_text; servidor usa o próprio recorte"
validation: FAIL
validated_at: "2026-09-27T06:02:44.233Z"
---

## Objetivo

Permitir selecionar texto no PDF e conversar sobre ele, usando a seleção somente quando verificada contra o texto server-side da página.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Contrato de confiança cliente→servidor (seleção) é mudança de segurança.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Ação "Conversar sobre isto" aparece com seleção não vazia na camada de texto.
- Cliente envia `selectionText` (≤ 2000 chars) com `fileId/pageNumber`.
- Servidor normaliza espaços/hifenização e verifica substring do `content_text`; usa o próprio recorte e offsets.
- Seleção não verificada é descartada; turno segue com foco de página e `meta.selectionVerified=false`.
- Seleção verificada recebe prioridade no contexto (antes da página).

## Testes

Unit: verificação com quebras de linha, hífen, espaços, texto adulterado, limite de tamanho. Integração: rota de chat com seleção válida/adulterada.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `lib/focus.ts` (verificação), `components/PdfReader*.tsx`, rota de chat.

Fora de escopo: Seleção em Markdown/Guia de Estudo, retrieval.

## Riscos

Normalização divergente entre pdf.js cliente e servidor (mesma lib reduz risco).
