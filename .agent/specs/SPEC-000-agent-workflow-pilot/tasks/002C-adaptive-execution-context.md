---
id: "002C"
title: "Perfis adaptativos e redução de contexto"
status: SESSION_CLOSED
blocked_by: ["002B"]
writer: codex
reviewer: lightweight-independent-review
commit: 67db0873e9ee5bff58c86ce2c7987f840fabbd3f
push: origin/chore/spec-000-task-002c-adaptive-execution
review_result: pass
handoff: .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/002C-adaptive-execution-67db087.md
execution_profile: STANDARD
profile_justification: "Mudança documental localizada no workflow, sem runtime do produto, migration, segurança, concorrência ou API pública."
profile_approved_by: human-request-2026-08-03
---

## Objetivo

Introduzir perfis FAST, STANDARD e FULL, aplicar gates e reviews proporcionais
ao risco, limitar tempo e contexto, tornar checks externos assíncronos e reduzir
imediatamente os adapters sem alterar código funcional do Zetel.

## Plano de execução

- [x] Registrar e reencadear 002C no estado validado, mantendo 003 em DRAFT.
- [x] Criar e observar falhar os testes focados dos contratos documentais.
- [x] Documentar perfis, classificação, budgets e serviços externos.
- [x] Atualizar README, QUALITY, SPEC, PLAN, TASKS e o contrato da tarefa 003.
- [x] Preservar contexto, arquitetura e histórico antes de reduzir os adapters.
- [x] Executar testes focados e `git diff --check` no fixed point.
- [x] Obter uma revisão read-only e corrigir apenas findings materiais.
- [x] Preparar o fechamento em dois commits sem iniciar a tarefa 003.

## Critérios de aceitação

- Perfis e overrides seguem o contrato aprovado desta tarefa.
- `AGENTS.md` tem no máximo 150 linhas; `CLAUDE.md`, no máximo 100.
- Conhecimento removido dos adapters permanece em documentos versionados.
- A tarefa 003 implementará gates e fechamento proporcionais ao perfil.
- Nenhum arquivo funcional de `app/`, `components/`, `lib/` ou `migrations/`
  será alterado.

## Gates aplicáveis

- Teste focado de contratos documentais.
- Testes de `agentctl` somente se seu contrato de runtime for alterado.
- Typecheck somente se TypeScript de produção for criado ou modificado.
- `git diff --check`.

## Exceção bootstrap

O lifecycle de tarefas será implementado na 003. Nesta tarefa, inclusão,
reencadeamento e transições do `state.json` usam diretamente
`assertTransition`, `validateState`, `writeJsonAtomic` e `expectedRevision`.

## Fora de escopo

- Implementar a tarefa 003.
- Alterar runtime funcional do Zetel ou do `agentctl`.
- Executar gates FULL, E2E live, OpenRouter, deploy ou merge em `main`.

## Resultado da revisão

`PASS`, sem findings bloqueantes ou não bloqueantes, no fixed point
`2823344c44f8b9357577cffefb1e903ca97a88465ed4c943f0f19272a6fa9306`.
