---
id: "002B"
title: "Fechamento documental pré-merge"
status: SESSION_CLOSED
blocked_by: ["002A"]
writer: codex
reviewer: claude
commit: "f13adc46d5d90f4953fc66370e3bfe1bdd25a078"
push: "origin/feat/spec-000-task-002-spec-lifecycle"
review_result: pass
handoff: "../handoffs/002B-premerge-documentation-closure-f13adc4.md"
---

## Objetivo

Resolver os dois threads CodeRabbit ainda válidos e as duas inconsistências
documentais remanescentes no PR #6, sem alterar o comportamento funcional do
lifecycle de spec, sem alterar código funcional do Zetel e sem iniciar a tarefa
003.

## Plano checkável

- [x] Reconstruir o checkpoint exclusivamente por Git, artefatos versionados e
      estado remoto do PR #6.
- [x] Registrar a 002B e reencadear temporariamente a 003 como `DRAFT`, usando a
      exceção bootstrap validada.
- [x] Remover do contrato público de `spec status` a promessa de exposição das
      entradas completas do manifest.
- [x] Corrigir o segundo `@param` de `describeReadiness` para `readiness`.
- [x] Corrigir os snippets públicos do handoff 002A e registrar errata histórica
      explícita.
- [x] Executar testes focados, gates, status read-only e verificações de
      locks/temporários.
- [x] Congelar o diff e obter reviews read-only de spec compliance e engineering
      quality em dois processos novos.
- [x] Criar e enviar o commit de entrega; atualizar o PR #6; responder, confirmar
      e resolver os dois threads válidos.
- [x] Concluir a última etapa histórica da checklist 002A com observação explícita
      de que foi fechada pela 002B.
- [x] Criar handoff, fechar a 002B em commit separado e liberar somente a 003
      para `READY`, sem iniciá-la.

## Testes e gates

- `pnpm exec vitest run tests/unit/agentctl --reporter=verbose`
- `pnpm build`
- `pnpm test:ci`
- `pnpm test:coverage`
- `pnpm typecheck`
- `./agentctl spec status SPEC-000-agent-workflow-pilot` — exit `1` esperado com
  `approval_status: LEGACY_UNVERIFIED` e sem persistência.
- `git diff --check`
- `find .agent/specs/SPEC-000-agent-workflow-pilot \
  \( -name '*.lock' -o -name '*.tmp' \) -print`

## Fora de escopo

Mudança comportamental em `runSpecStatus` ou no lifecycle de spec, lifecycle de
tarefa, código funcional do Zetel, E2E live, OpenRouter, deploy, Vercel CLI,
serviços externos e merge do PR #6.

## Critério de fechamento

As quatro correções documentais estão versionadas; gates e dois reviews estão
`PASS`; os dois threads válidos foram respondidos e resolvidos; nenhum finding
válido permanece aberto; delivery e closing SHAs estão confirmados no remote;
002B e sessão estão `SESSION_CLOSED`; 003 está somente `READY` com
`blocked_by: ["002B"]`; PR #6 permanece aberto e a árvore está limpa.
