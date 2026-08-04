---
id: "003A"
title: "Endurecimento pré-merge do lifecycle de tarefa"
status: SESSION_CLOSED
blocked_by: ["003"]
writer: codex
reviewer: codex-independent-engineering
commit: 8c215d2f705b099f1f1c65b5f90e3638cf84b279
push: origin/feat/spec-000-task-003-task-lifecycle-gates
review_result: PASS
handoff: .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/003A-task-lifecycle-hardening-8c215d2.md
execution_profile: FULL
profile_justification: "Correções de segurança, execução de processos, atomicidade, evidências e lifecycle."
validation: PASS
validated_at: "2026-08-03T14:52:20.954Z"
---

## Objetivo

Corrigir falhas de segurança, atomicidade e integridade encontradas após a
implementação da tarefa 003, antes do merge do PR #8.

## Comportamento entregue

`task next` e `task start` compartilham a mesma guarda de integridade; o runner
rejeita shell indireto, aplica timeout padrão e normaliza ENOENT; `task validate`
sela evidência antes de REVIEWING; frontmatter complexo é preservado; reviews e
`reviews_requested` não são burláveis.

## Criterios de aceitacao

- `task next` exige spec APPROVED com `approval.integrity` válido e permanece
  read-only.
- Shell indireto (`sh -c`, bash, cmd, PowerShell) é rejeitado.
- Gates possuem timeout padrão de 15 minutos; timeout e ENOENT geram evidência
  uniforme.
- `task start` não persiste estado sem arquivo da tarefa.
- Frontmatter preserva comentários, listas, mapas e chaves desconhecidas.
- REVIEWING/PASS não são persistidos antes da evidência selada e fresca.
- Probes Git de TypeScript falham de forma explícita.
- `git_head` novo não contém newline.
- `reviews_requested` malformado e reviews extras bloqueantes impedem close.
- Perfil inválido em `assertReviewsAllowed` não causa TypeError.

## Testes focados

`tests/unit/agentctl/task-lifecycle.test.ts` e casos adversariais de runner,
frontmatter, evidência, reviews e integridade.

## Gates por perfil

FULL: focados, integrações declaradas (se houver), build, test:ci, coverage,
typecheck e diff-check. Sem E2E live/OpenRouter.

## Arquivos ou areas provaveis

`scripts/agentctl/commands/task-*.mjs`, `process-runner.mjs`, `evidence.mjs`,
`review-evidence.mjs`, `task-frontmatter.mjs`, `execution-profile.mjs`,
`.agent/COMMANDS.md`, `.agent/STATE.md`, testes unitários.

## Fora de escopo

Tarefa 004, merge do PR, mudanças em `app/`, `components/` ou `lib/`, reescrita
retroativa da evidência histórica 003.

## Riscos

Atomicidade parcial em validate; regressão de frontmatter; falsos positivos em
heurística de identidade humana.

## Decisoes

- Evidência histórica 003 é preservada; newline em `git_head` é corrigido só
  para execuções novas.
- SESSION_CLOSED da 003 permanece; bootstrap pós-push continua fora de
  `task close` até a 005.
- Uma revisão independente (`engineering-quality`) é suficiente para esta
  correção pré-merge localizada.
