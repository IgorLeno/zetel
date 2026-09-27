---
task_id: "004"
delivery_commit: fc2f9f3043365f4ae9fd4533fa8095a024c00761
remote: origin/main (merge 643283d33727d006a7269a897cc07e96fc243ec4, PR #17)
closed_at: 2026-09-27T06:20:02.190Z
---

# Handoff 004 — Selecao verificada: Conversar sobre isto

## Tarefa

- ID: 004
- Writer: claude
- Perfil: FULL, reviews_requested: 2

## Entrega

- `lib/focus.ts`: `parsePdfPageFocus` aceita `selectionText?` (nao-string = 400); `verifyPdfSelection` compara ignorando espacos/quebras, soft hyphen e hifen de fim de linha, NFC na selecao; teto 2000 chars; devolve o recorte do PROPRIO servidor (`content_text.slice(start, end)`), offsets e sha256; primeira ocorrencia.
- Rota de chat: selecao verificada entra como `<fonte id="S1" tipo="selecao">` antes da pagina (`S2 tipo="foco"`), com regra de foco no system prompt; nao verificada e descartada, turno segue com a pagina e `meta.selectionVerified=false`. Meta so com `selectionVerified/selectionStart/selectionEnd/selectionHash`; log so IDs.
- `lib/chat-prompt.ts`: `tipo: 'foco' | 'selecao'`, `FOCUS_SELECTION_MAX_CHARS = 2000`; correcao do `FONTE_TAG` guloso (follow-up da 003) com regressao.
- UI: botao "Conversar sobre isto" no `PdfReader` so com selecao nao vazia dentro de `.textLayer` (desabilitado > 2000); chip no `ChatPanel` com remocao, prefill "Explique este trecho."; selecao limpa ao trocar de pagina e apos turno aceito.
- Commit fc2f9f3 (feito pelo usuario), mergeado em `main` por 643283d (PR #17) ANTES do fechamento do lifecycle.

## Gates

- `evidence/004-validation.json`: **FAIL** (fixed point 37d7b964…). focused/build/test:ci PASS; `pnpm test:coverage` exit 1 sob alta carga; typecheck e diff-check nao chegaram a rodar no gate. Evidencia original preservada.
- Depois, `pnpm test:coverage` isolado na mesma working tree: exit 0, 38/38 arquivos, 427/427 testes (fora do agentctl).
- `pnpm typecheck` e `git diff --check` manuais: exit 0.
- Decisao humana: falha de coverage = flake de infraestrutura/carga; sem nova suite FULL.
- Smoke `next start` com `ZETEL_HOME`/vault temporarios: botao so com selecao; POST com `selectionText` "entro-\npia de um sistema isolado" verificado contra `content_text` real (offsets 28-60); troca de pagina limpa chip; logs sem conteudo. Sem OpenRouter (400 de chave).

## Revisoes

- **NAO executadas** (0 de 2). `task review` exige sessao REVIEWING, so alcancavel com validate PASS. `review_result: NOT_RUN`.

## Reconciliacao do workflow

- `evidence/004-reconciliation.json`: reconciliacao administrativa pos-merge, somente para alinhar o workflow ao repositorio.
- Script descartavel usando `loadSpecState`, `assertTransition`, `validateState`, `writeJsonAtomic` (expectedRevision), `prepareOperationalFrontmatter` + `writeTextAtomic`; uma escrita por aresta: VALIDATING->REVIEWING->DONE->PUSHED->SESSION_CLOSED. Guards de comando `gate-failed` e reviews contornados por decisao humana; `validation` segue FAIL; agentctl nao alterado.

## Follow-ups (nao bloqueantes)

- Reviews independentes da 004 nunca rodaram; considerar revisar `fc2f9f3` (seguranca: verificacao da selecao) numa sessao futura.
- Selecao repetida na pagina usa a primeira ocorrencia (sem desambiguacao por posicao do cliente).
- Hifen seguido de quebra e sempre removido na comparacao (ex.: "bem-\nestar" casa com "bemestar"); inofensivo porque o recorte e do servidor.
- Chip nao reaplica prefill se a mesma selecao for escolhida de novo.
- Sem testes de componente para `PdfReader`/`ChatPanel` (selecao, chip, payload).
- `task validate` nao guarda a saida completa de gate falho, so preview; dificulta diagnostico de flakes.
- Nao existe mecanismo de waiver/reconciliacao no agentctl.

## Proxima tarefa

- 005 Study sessions e continuidade (liberada: depende so de 001). Partir de `origin/main` atualizado.
