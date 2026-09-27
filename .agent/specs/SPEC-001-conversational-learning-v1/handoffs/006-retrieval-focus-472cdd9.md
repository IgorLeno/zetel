---
task_id: "006"
delivery_commit: 472cdd9d42aed3fb1df79df3dcbc37efc6b9a637
remote: "origin/main (PR #23 merge 4092173f39b87f1973ba97b9cbf7c1ad633dd574)"
closed_at: 2026-09-27T13:17:51.661Z
---

# Handoff 006 — Retrieval, foco por linguagem natural e referencias

## Tarefa

- ID: 006
- Perfil: FULL, reviews_requested: 2
- Fechamento administrativo pos-merge. A implementacao ja estava em `main`.

## Entregue

- FTS5 lexical no Zetel (`passages_fts`), indexando `pdf_pages` e `zetel_pages`.
- Retrieval top-k (`RETRIEVAL_MAX_K = 4`), excluindo o foco atual.
- Fallback ao vocabulario da pagina em pergunta relacional.
- Maximo de 900 caracteres por trecho (`RETRIEVAL_PASSAGE_MAX_CHARS`).
- Fontes recuperadas no servidor; evento `[SOURCES]`; marcadores `[fonte:Sx]`.
- Chips clicaveis e navegacao para o PDF/pagina.
- ID inexistente nao vira referencia.
- Foco por linguagem natural, com hints `beginning` e `end`.
- Fonte tratada como dado, contra prompt injection.
- Commit funcional `472cdd9d42aed3fb1df79df3dcbc37efc6b9a637`. Registro da evidencia em `21c3c1e7ce1ef285c106de0e72cec2d0e520e2c1`. Merge em `main` pelo PR #23 (`4092173f39b87f1973ba97b9cbf7c1ad633dd574`).

## Smoke

- PDF temporario `/tmp/zetel-smoke-006/termo.pdf` (fora do Git). Zetel local displayName "Smoke 006", id `b15a5ab3-5ab4-42ef-9377-fec552ce7558`, slug `smoke-006`, arquivo `900cf795-af8e-4bd0-bf48-4464f6513422`.
- Na pagina 1, "Relaciona isso com outra parte do documento." recuperou a pagina 3 como `tipo=recuperado`. A resposta citou a fonte. O chip `Documento · p. 3` apareceu. `Ir ate a pagina` abriu a pagina 3 do mesmo PDF e nao disparou turno novo.
- "So dessa pagina." persistiu foco de pagina.
- "Relaciona com o comeco do documento." persistiu hint `beginning`.

## Gates

- `evidence/006-validation.json`: **PASS** preservado. fixed point `89e8b4e26b45f470860756298b447cb98e49625bc7e270042cd08e70be3724e4`.
- focused, build, test:ci, coverage, typecheck e diff-check: PASS (exit 0).
- A publicacao VALIDATING→REVIEWING falhou por conflito de revision (expected 48, found 49). O `state.json` ficou VALIDATING/FAIL ate esta reconciliacao. A evidencia PASS nao foi reescrita. Gates nao foram reexecutados.

## Revisoes

- Nao executadas (0 de 2). Nao executado porque a publicacao VALIDATING->REVIEWING falhou por conflito de revision apos todos os gates PASS; implementacao posteriormente mergeada.
- `review_result: NOT_RUN`. Este fechamento nao registra PASS de review.

## Reconciliacao do workflow

- `evidence/006-reconciliation.json`: reconciliacao administrativa pos-merge. Nao substitui a evidencia de validacao.
- Script descartavel usando `loadSpecState`, `assertTransition`, `validateState`, `writeJsonAtomic` (expectedRevision) e frontmatter atomico. Arestas: VALIDATING→REVIEWING→DONE→PUSHED→SESSION_CLOSED. Guard de reviews do `task close` contornado por decisao humana; `validation` segue PASS; agentctl e codigo de produto nao foram alterados.

## Follow-ups

- O Zetel local "Smoke 006" permanece em `~/.zetel` e nao deve ser apagado sem pedido.

## Proxima tarefa

- 007 — Perfis do tutor. Liberada: `blocked_by` e somente 005, ja `SESSION_CLOSED`. Nao implementar nesta sessao.
- Partir de `main` atualizado depois do merge desta reconciliacao. Politica implementation-first: o perfil precisa alterar o prompt no produto antes de uma grande expansao de testes.
- Abordagem proposta: migration `009_tutor_profiles` do PLAN; seis built-ins imutaveis em codigo; eixos 0–4 e tom 0–2 compilados de forma deterministica no system prompt; override so da sessao; personalizado editavel; `GET/POST/PATCH /api/tutor-profiles` com built-in somente leitura; UI com barras e radar fora da area principal; um teste de que niveis distintos mudam as instrucoes enviadas.
