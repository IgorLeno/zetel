# 001B — Matriz de resolucao de findings

Branch: `chore/spec-session-workflow-pilot`  
Baseline pre-001B (fechamento 001A): `c3569b78373e45d1838f6aea1775bf544e995a62`  
001A delivery/checkpoint: `6f91b87476942d0bd6aa53295c283fdbfcdf6af5`  
Repository: `IgorLeno/zetel` · remote: `origin` · PR `#5`

| # | Finding | Classificacao | Justificativa | Acao |
| --- | --- | --- | --- | --- |
| 1 | Saida de `BLOCKED` aceita destinos sem aresta | `VALID — IMPLEMENT` | `to === return_to` bastava; `DONE`/`PUSHED`/etc. passavam | Exigir `return_to ∈ statusesThatCanBlock(entity)` |
| 2 | Sessao `DONE`/`PUSHED` sem `task_id` | `VALID — IMPLEMENT` | Checkpoint sem rastreabilidade da tarefa | `task_id` obrigatorio + status igual + `active_task` null |
| 3 | Tarefa ativa com `session.status` null | `VALID — IMPLEMENT` | Residual 001A; quebrava acoplamento canonico | Tarefa ativa ⇔ sessao ativa correspondente |
| 4 | `session.status` ausente aceito | `VALID — ADAPT` | CodeRabbit pedia rejeitar null sempre; contrato distingue ausente vs null | Ausente → `guard: status`; `null` so sem trabalho ativo |
| 5 | Parametro morto `seenIds` | `VALID — IMPLEMENT` | Assinatura desonesta apos 2a passagem | Removido parametro e `void seenIds` |
| 6 | fsync dir vs documentacao | `VALID — ADAPT` | Implementacao ja era best-effort apos rename; docs diziam garantia plena | `fsyncDirectoryBestEffort` + contrato em `STATE.md` |
| 7 | Timeout do teste concorrente | `VALID — IMPLEMENT` | Default Vitest 5s pode falhar no CI | `it(..., 15_000)` no teste de corrida |
| 8 | Resultado revisao 001A ainda “Pendente” | `VALID — IMPLEMENT` | Frontmatter `PASS` vs secao inconsistente | Secao atualizada com refs aos reviews |
| 9 | Baseline SHA pre-001A no next-phase | `VALID — IMPLEMENT` | Checkpoint apos 001A deve apontar entrega | Label `001A delivery/checkpoint baseline` → `6f91b87…` |
| 10 | Regras tech da 008 (CodeRabbit) | Ver tabela abaixo | Pacote generico; verificar evidencia | Atualizado path-scoped / NOT APPLICABLE |
| 11 | Usage guard / process.exit / launcher ESM | `STALE — SKIP` | Resolvido na 001A; codigo atual conforme | Nenhuma alteracao |
| 12 | `exists` vs `revision: null` | `STALE — SKIP` | Flag `exists` ja presente | Nenhuma alteracao |
| 13 | Handoffs absolutos / SPEC BLOCKED linear | `STALE — SKIP` | Corrigidos na 001A | Nenhuma alteracao |
| 14 | Criterio closing commit da tarefa 005 | `NOT APPLICABLE — SKIP` | Escopo da 005; fora da 001B | Nao alterar 005 alem do necessario |
| 15 | README/`repositories-assessed` paths locais | `NOT APPLICABLE — SKIP` | Fora das invariantes de state machine da 001B | Nao expandir escopo |
| 16 | `blocked_by` fail-open sem context | `NOT APPLICABLE — SKIP` | Contrato 001A exige context; fail-closed ja aplicado | Sem mudanca de comportamento |
| 17 | Novo estado `IDLE` | `NOT APPLICABLE — SKIP` | Prompt proibe ampliar schema | Manter `status: null` |

## Tarefa 008 — verificacao individual (001B)

| Regra candidata | Classificacao | Evidencia |
| --- | --- | --- |
| Next.js App Router | `VALID — path-scoped` | Stack obrigatoria em `AGENTS.md`/`CLAUDE.md` |
| React Strict Mode | `NOT APPLICABLE — SKIP` | Sem `reactStrictMode` / `<StrictMode>`; nao inferir do default do Next |
| TS camelCase (internos) | `VALID — path-scoped` | Convencao efetiva em `*.{ts,tsx}` internos; excecoes de API/DB/JSON/protocolos |
| `better-sqlite3` singleton sem pool | `VALID — path-scoped` | Regra #7 + `lib/db.ts` |

## Escopo preservado

- Nenhuma alteracao em codigo funcional do Zetel (`app/`, `components/`, `lib/` de produto).
- Tarefa 002 nao iniciada (`DRAFT` durante 001B; `READY` so apos fechamento).
- Sem merge, sem nova PR, sem E2E live.
