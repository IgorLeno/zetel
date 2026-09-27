---
task_id: "003"
delivery_commit: 5d0522377329bd4b5e834ff978ce37009cff24a2
remote: origin/feat/spec-001-task-003-pdf-reader
closed_at: 2026-09-27T05:07:50.274Z
---

# Handoff 003 — Leitor PDF e foco de pagina no chat

## Tarefa

- ID: 003
- Writer: claude
- Perfil: FULL, reviews_requested: 2

## Entrega

- `GET /api/zetels/[id]/files/[fileId]/pdf`: so arquivo PDF registrado no Zetel; traversal e symlink externo bloqueados (`lib/focus.ts` `resolvePdfFile`); headers `nosniff`, `no-store`, `CSP: sandbox`.
- Chat aceita `focus {fileId, pageNumber}`; servidor le `pdf_pages` (`resolvePdfPageFocus`); bloco `<fonte>` sanitizado (`sanitizeSourceText`/`buildSourceBlock`, pagina <= 6000 chars) + regra de dados no system prompt; `meta.focusFileId/focusPageNumber/focusContentHash`.
- UI: botao "Estudar" (Arquivos) abre `?view=pdf&file=`; `PdfReader` (pdf.js no cliente, worker local `components/pdf-worker.ts`, canvas + camada de texto, `ssr: false`) ao lado do `ChatPanel` (`pdfFocus` via ref; mudar pagina nao dispara turno).
- Commit 5d05223 (feito pelo usuario antes do close; conteudo aceito) em `origin/feat/spec-001-task-003-pdf-reader`.

## Gates

- `evidence/003-validation.json`: PASS (fixed point 73f50868fbc7e6a866ca3a6f0461f360193689844d96ff7345323da10bafe048), segunda tentativa. Primeira tentativa falhou so em coverage por `Timeout calling "onTaskUpdate"` em `tests/unit/agentctl/task-lifecycle.test.ts` com maquina carregada.
- Smoke `next start` com `ZETEL_HOME`/vault temporarios: rota 200/404, navegacao, camada de texto, POST so com IDs, logs so IDs/contagens. Sem chamadas OpenRouter.

## Revisoes

- `reviews/003-aggregate.json`: PASS (spec-compliance PASS, engineering-quality PASS), revisores `claude-subagent-*`, 0 BLOCKING.
- `diff.patch` do pacote saiu vazio (base = HEAD 5d05223); revisores leram o patch `c563eb6..5d05223`.

## Follow-ups (nao bloqueantes)

- `FONTE_TAG` em `lib/chat-prompt.ts` e guloso: `<` sem `>` posterior seguido de "fonte" apaga o resto da pagina no prompt (ex.: "T < fonte quente"). Restringir o match.
- Erro de render de pagina no `PdfReader` persiste apos navegar.
- Rota PDF carrega arquivo inteiro na memoria, sem range.
- Sem testes de componente (leitor, view, payload do ChatPanel).
- Nota sugerida em turno PDF nao registra pagina de origem.
- Nomes de meta (`focus*`) diferem do texto do criterio (`fileId`/`pageNumber`/`content_hash`).
- `prepare` gera diff vazio quando a entrega ja esta commitada no HEAD.

## Proxima tarefa

- Pela ordem do plano: 004 Selecao verificada (FULL), liberada apos 003 SESSION_CLOSED.
