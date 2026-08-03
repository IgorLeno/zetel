---
id: "002A"
title: "Correções pré-merge do lifecycle de spec"
status: SESSION_CLOSED
blocked_by: ["002"]
writer: codex
reviewer: claude
commit: "227aa661570cad14dda58566008a5b9d51af9ef1"
push: "origin/feat/spec-000-task-002-spec-lifecycle"
review_result: pass
handoff: "../handoffs/002A-spec-lifecycle-premerge-227aa66.md"
---

## Objetivo

Corrigir somente os findings ainda válidos do PR #6 após o fechamento da
tarefa 002, preservar o escopo do lifecycle de spec e deixar a branch existente
tecnicamente pronta para merge sem iniciar a tarefa 003.

## Desenho aprovado

- Endurecer parsers e readiness com validadores pequenos e determinísticos,
  limitados ao formato canônico do workflow.
- Tratar reapproval legada como migração explícita do envelope de integridade,
  sem inventar uma transição `APPROVED -> APPROVED`.
- Distinguir ausência de `approval.integrity` de envelope presente e inválido.
- Preservar `SPEC-SUMMARY.md` como artefato obrigatório e contextual fora do
  digest material, com marcadores ainda bloqueando approval.
- Manter toda mutação de `state.json` sob `assertTransition`, `validateState`,
  `writeJsonAtomic` e `expectedRevision`.

## Plano checkável

- [x] Registrar a triagem técnica dos 18 threads CodeRabbit e dos seis findings
      agrupados em `reviews/002A-findings-resolution.md`.
- [x] Escrever e observar testes RED para parser estrito de `spec create`.
- [x] Escrever e observar testes RED para reapproval legada e preservação de
      metadados históricos.
- [x] Escrever e observar testes RED para integrity ausente versus malformada.
- [x] Escrever e observar testes RED para substância, frontmatter real e
      coerência entre `state.json`, `TASKS.md` e `tasks/*.md`.
- [x] Implementar a menor correção para cada teste e manter os testes focados
      verdes a cada ciclo.
- [x] Atualizar contratos de CLI, exclusão de `SPEC-SUMMARY.md`, trust boundary
      e errata histórica sem reescrever evidência da tarefa 002.
- [x] Executar gates na ordem de `.agent/QUALITY.md` e registrar exits, contagens,
      horários, working tree/SHA e limitações.
- [x] Congelar o diff, calcular SHA-256 e obter duas revisões Claude Code novas,
      read-only e sem compartilhamento de relatórios.
- [x] Corrigir qualquer finding bloqueante e repetir testes, gates e reviews se
      o diff material mudar.
- [x] Entregar e fechar em dois commits, ambos enviados por push normal para a
      branch existente, sem merge e sem iniciar 003.
- [x] Atualizar o corpo do PR #6, aguardar a nova análise CodeRabbit e triar
      todos os threads sem resolução automática injustificada.

Concluído posteriormente pela tarefa 002B, após a triagem final dos threads
pré-merge.

## Testes focados

`pnpm exec vitest run tests/unit/agentctl --reporter=verbose`, incluindo
integração pelo launcher público `./agentctl` e nenhuma dependência de rede.

## Gates obrigatórios

`pnpm build`, `pnpm test:ci`, `pnpm test:coverage`, `pnpm typecheck`,
`./agentctl spec status SPEC-000-agent-workflow-pilot` (exit `1` esperado com
`LEGACY_UNVERIFIED`) e `git diff --check`.

## Fora de escopo

Lifecycle de tarefa, assinatura criptográfica, schema novo, lock global de
Markdown, dependência npm, código funcional do Zetel, E2E live, OpenRouter,
deploy, Vercel e merge do PR.

## Critério de fechamento

Dois reviews `PASS`, gates completos verdes, delivery e closing SHAs confirmados
no remote, PR #6 atualizado e ainda aberto, 002A `SESSION_CLOSED`, 003 apenas
`READY` com `blocked_by: ["002A"]`, `active_task: null` e árvore limpa.

## Fixed point de revisão

`/tmp/002A-fixed.diff`, SHA-256
`5a4e7e2f3f4b5e63ad9a2663f3e609efaab9bec2b764f4d9b32dadbb4f4cb01e`,
94.497 bytes e 1.701 linhas. O snapshot material foi congelado após todos os
gates verdes e antes da transição para `REVIEWING`.
