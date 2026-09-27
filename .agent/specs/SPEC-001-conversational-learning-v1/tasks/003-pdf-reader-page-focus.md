---
id: "003"
title: "Leitor PDF e foco de página no chat"
status: SESSION_CLOSED
blocked_by: ["002"]
writer: null
reviewer: null
commit: 5d0522377329bd4b5e834ff978ce37009cff24a2
push: origin/feat/spec-001-task-003-pdf-reader
review_result: PASS
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/003-pdf-reader-page-focus-5d05223.md
execution_profile: FULL
profile_justification: "Nova rota serve arquivo do vault (path traversal, posse por Zetel) e altera contrato publico do chat (foco resolvido server-side, texto de fonte no prompt): seguranca e contrato publico, FULL por regra."
validation: PASS
validated_at: "2026-09-26T17:07:55.860Z"
---

## Objetivo

Exibir o PDF ao lado do chat com página atual rastreada e fazer o servidor usar o texto da página PDF do `pdf_pages` em cada turno.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Altera contrato da rota de chat (resolução server-side do foco) e adiciona rota que serve arquivo do vault: segurança e contrato público.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Visão de estudo abre o PDF (pdf.js, camada de texto) com navegação por página.
- `GET .../files/[fileId]/pdf` serve apenas arquivo registrado no Zetel; testes de traversal/ID alheio.
- Chat aceita `focus.fileId/pageNumber`; servidor valida posse e busca `pdf_pages.content_text`; conteúdo do cliente ignorado.
- Fonte do foco entra em bloco `<fonte>` sanitizado; regra de dados no system prompt.
- `meta` da mensagem registra `fileId`/`pageNumber`/`content_hash` (sem conteúdo).
- Mudar de página não dispara fala nem turno.
- Fluxo Markdown/Documento Técnico inalterado.

## Testes

Unit: sanitização de fonte (sentinela e delimitador neutralizados). Integração: chat com OpenRouter mockado usando página PDF; foco de arquivo de outro Zetel rejeitado.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `components/PdfReader*.tsx`, `components/ZetelWorkspace.tsx`, `components/ChatPanel.tsx`, `app/api/zetels/[id]/chat/route.ts`, `app/api/zetels/[id]/files/[fileId]/pdf/route.ts`, `lib/chat-prompt.ts`.

Fora de escopo: Seleção, sessões, retrieval, perfis.

## Riscos

Worker do pdf.js no Next; acoplamento do ChatPanel (refactor mínimo, sem reescrever).
