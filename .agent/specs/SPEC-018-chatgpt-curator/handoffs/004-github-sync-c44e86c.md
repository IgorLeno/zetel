---
task_id: "004"
delivery_commit: c44e86cc3c1d7a4d9b43864016eeb44e40994e67
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-22T19:29:21.000Z
---

# Handoff 004 — Sincronização do clone do canal por fast-forward

## Tarefa

- ID: 004
- Perfil: FULL, reviews_requested: 1 (engineering-quality com foco em
  segurança; o agentctl não tem eixo `security`).
- 004 estava DRAFT; liberada para READY pelo domínio do agentctl
  (`assertTransition` + `validateState` + `writeJsonAtomic`), pois não
  há comando de liberação. Sessão fechada à mão, autorizado pelo Igor.

## Entregue

- `lib/channel-git.ts`: `syncChannel()` = `fetch` + `merge --ff-only` via
  `execFile`, args fixos, `GIT_TERMINAL_PROMPT=0`, timeout 30 s; `-c
  core.hooksPath=` (vazio), `core.fsmonitor=false`, `submodule.recurse=false`;
  remove do env `GIT_DIR`/`GIT_WORK_TREE`/`GIT_CONFIG_*` etc.; chamadas
  serializadas no processo. Status `ok | not_a_repo | diverged | error` +
  `fetched` (commits trazidos).
- `channel_dir` precisa de `.git` próprio; subpasta de outro repositório =
  `not_a_repo`. Divergência e alteração local que o fast-forward
  sobrescreveria = `diverged`, clone intocado.
- `app/api/channel/sync/route.ts`: `POST`, same-origin JSON, revalida
  `channel_dir`; 200/400/409/502 com `{ status, fetched, error? }`; log só
  status e contagem.
- Botão "Buscar do canal" em `components/ArquivosPanel.tsx`.
- `tests/integration/channel-sync.test.ts` (18 testes, bare repo local, sem
  rede); threshold de coverage para `lib/channel-git.ts`;
  `.agent/ARCHITECTURE.md` documenta o hardening.

## Gates

- FULL (focados, build, test:ci, coverage, typecheck, diff-check): PASS
  (`evidence/004-validation.json`).
- Review r1 achou F001 (env GIT_* herdado) e F002 (timeout/lock virando
  `diverged`), corrigidos e revalidados; r2 PASS (`reviews/004-aggregate.json`).

## Pendências não bloqueantes

- F003 (NIT): ramo de timeout de 30 s e remoto pedindo credencial sem teste
  direto (git ausente no PATH cobre o ramo sem exit code).
- Lock do git disputado por processo externo aparece como `diverged`
  (git sai com 1 em ambos os casos).
- Não validado manualmente com o repositório real do canal no GitHub (SSH do
  Igor); fica para a 008.
- O `pnpm build` do gate reescreveu `.next/` com o dev server do Igor ativo:
  reiniciar o `next dev`.

## Próximo

- 005: curadoria por IA sobre os relatórios importados.
