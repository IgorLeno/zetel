# Handoff — SPEC-000 tarefa 001B

## Spec

`SPEC-000-agent-workflow-pilot`

## Tarefa

`001B` — Fechamento das invariantes remanescentes

## Resultado

`PASS` (spec compliance + engineering quality). Entrega empurrada; sessao a
fechar neste handoff.

## Findings implementados

- Saida de `BLOCKED` restrita a `statusesThatCanBlock`
- Rastreabilidade obrigatoria em sessoes `DONE`/`PUSHED`
- Tarefa ativa exige sessao ativa correspondente
- Propriedade `session.status` ausente rejeitada
- Remocao do parametro morto `seenIds`
- Timeout 15s no teste concorrente
- Documentacao 001A (resultado PASS) e baseline 001A

## Findings adaptados

- `session.status: null` permanece valido sem trabalho ativo (nao introduzir `IDLE`)
- `fsync` de diretorio como best-effort pos-rename (`fsyncDirectoryBestEffort`)
- Regras tech da 008: App Router / camelCase path-scoped; Strict Mode N/A;
  better-sqlite3 confirmado

## Findings ignorados

- Achados STALE da 001A (launcher ESM, process.exitCode, exists flag, etc.)
- Escopo da tarefa 005 / README paths locais / merge

## Testes

`pnpm exec vitest run tests/unit/agentctl` — PASS (39+; state-machine 23)

## Gates

Ver `reviews/001B-gates.md` — build, test:ci, coverage, typecheck, spec status,
`git diff --check` verdes. E2E live nao executado.

## Commit de entrega

`7fb300f724a9f1c277b1c5c7f09e19b69be772c0`

## Remote

`origin/chore/spec-session-workflow-pilot` (confirmado igual ao HEAD local apos push)

## Limitacoes

- Writer e reviewer da mesma familia (Cursor); independencia reduzida.
- Lifecycle CLI ainda ausente; mutacoes via `writeJsonAtomic` (bootstrap).
- `fsync` de diretorio best-effort por design.

## Estado do CodeRabbit

Reavaliar comentarios novos apos este push; nao aplicar automaticamente.

## Proxima tarefa 002

`002` — Lifecycle de spec (`READY` apos este fechamento). Executar em processo
novo; nao usar `resume` nem `continue`.

Comando portatil:

```bash
cd "$(git rev-parse --show-toplevel)" && claude 'Leia .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/001B-final-invariants-7fb300f.md, .agent/specs/SPEC-000-agent-workflow-pilot/SPEC-SUMMARY.md e .agent/specs/SPEC-000-agent-workflow-pilot/tasks/002-spec-lifecycle.md. Execute somente a tarefa 002 em processo novo; nao use resume nem continue.'
```

## Arquivos relevantes

- `scripts/agentctl/domain/state-machine.mjs`
- `scripts/agentctl/infra/atomic-write.mjs`
- `tests/unit/agentctl/*.test.ts`
- `.agent/STATE.md`
- `reviews/001B-*.md`
- `tasks/001B-final-invariants.md`

## Decisoes que nao devem ser reabertas

- Sem estado `IDLE`; `status: null` = sem sessao iniciada.
- Nao propagar falha de fsync de diretorio apos rename.
- Saida de `BLOCKED` nunca para DRAFT/READY/DONE/PUSHED/SESSION_CLOSED.
- Nao iniciar 002 nesta sessao; nao mergear PR #5 aqui.

## Estado da arvore

Limpa apos o commit de fechamento; HEAD local == remoto.
