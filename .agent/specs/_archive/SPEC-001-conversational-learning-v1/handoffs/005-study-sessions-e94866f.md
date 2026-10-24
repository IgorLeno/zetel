---
task_id: "005"
delivery_commit: e94866f1b9a44944ac0e5b879f3c21cc20680a12
remote: "origin/main (PR #20 merge d49495c1eb29a2a79975bff662e0d231a56419de; PR #21 merge 7a1a8f2af38b84c359c4bcde1c7c9ef5fb124139)"
closed_at: 2026-09-27T11:50:15.390Z
---

# Handoff 005 — Study sessions e continuidade

## Tarefa

- ID: 005
- Perfil: FULL, reviews_requested: 2
- Fechamento administrativo pos-merge. A implementacao ja estava em `main`.

## Entregue

- `study_sessions` e migration 007, com backfill dos historicos existentes.
- Mensagens associadas a sessao e isolamento do historico por sessao.
- Nova sessao, continuar sessao e renomear.
- Restauracao de PDF e pagina.
- Atualizacao de foco sem disparar turno.
- Ownership no PATCH do chat.
- POST sem `sessionId` permanece compativel.
- GET sem ID resolve a sessao recente.
- DELETE sem ID retorna 400.
- Commit funcional `e94866f`, mergeado em `main` pelo PR #20 (`d49495c`). O ajuste de timeout do lifecycle (`13975e2`) e o registro da evidencia FAIL entraram pelo PR #21 (`7a1a8f2`).

## Gates

- `evidence/005-validation.json`: **FAIL** preservado. fixed point `de2a099c…`. focused, build e test:ci PASS; coverage exit 1; typecheck e diff-check nao chegaram a rodar nesse gate.
- O bloqueio observado na sessao foi timeout de `requires matching review fixed_point for STANDARD` em `tests/unit/agentctl/task-lifecycle.test.ts`, teste do agentctl, nao da 005. O timeout individual passou de 5 s para 15 s em `13975e2`, ja em `main`.
- Fora do gate: coverage isolado PASS (40 arquivos, 435 testes); test:ci isolado PASS; typecheck e diff-check manuais PASS; testes especificos da 005 verdes.
- Decisao humana: nao reexecutar validate nem suites FULL; nao converter o FAIL em PASS.

## Revisoes

- Duas revisoes no fixed point anterior `fad089f5…`: spec-compliance PASS; engineering-quality BLOCK por defeito material no backfill de foco PDF. Esse defeito foi corrigido antes do merge.
- Nao ha pacote oficial nem aggregate do fixed point entregue `de2a099c…`, porque `task validate` nao chegou a PASS. `review_result: NOT_RUN`. Este fechamento nao registra PASS de review.

## Reconciliacao do workflow

- `evidence/005-reconciliation.json`: reconciliacao administrativa pos-merge. Nao substitui a evidencia de validacao.
- Script descartavel usando `loadSpecState`, `assertTransition`, `validateState`, `writeJsonAtomic` (expectedRevision) e frontmatter atomico. Arestas: VALIDATING→REVIEWING→DONE→PUSHED→SESSION_CLOSED. Guards de comando `gate-failed` e reviews contornados por decisao humana; `validation` segue FAIL; agentctl e codigo de produto nao foram alterados.

## Follow-ups (nao bloqueantes, nao reabertos aqui)

- Ownership de `/api/memory`.
- Restauracao visual automatica de Markdown ao continuar a sessao.
- MINOR ja conhecido que nao seja perda ou corrupcao de dados, inclusive a FK que nao amarra `chat_messages.zetel_id` ao Zetel da sessao.

## Proxima tarefa

- 006 — Retrieval, foco por linguagem natural e referencias. Liberada: 003 e 005 estao fechadas. Nao implementar nesta sessao.
- Partir de `main` atualizado. Branch sugerida: `feat/spec-001-task-006-retrieval-focus`.
- Politica daqui para frente: implementation-first. Implementar o fluxo principal, verificacoes minimas relevantes, rodar o produto, testar o fluxo real, corrigir problemas concretos e acrescentar regressao pontual quando houver um problema que justifique. Sem suites, benchmarks, mocks ou auditorias grandes sem esse problema.
- Aceitacao principal da 006: abrir material, conversar, pedir relacao com outra parte do Zetel, o retrieval encontrar trecho relevante, a resposta citar a fonte, clicar na referencia e chegar ao material ou pagina correta.
