---
task_id: "003"
delivery_commit: b2015fc4eed713c69b6a9d652bae96675303ff20
followup_commit: 80e5b651c07d
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-22T19:10:00.000Z
---

# Handoff 003 — Importação idempotente da caixa de entrada local

## Tarefa

- ID: 003
- Perfil: FULL, reviews_requested: 2
- Fechamento de sessão feito no início da sessão seguinte, com autorização do
  Igor, porque não existe comando `session close` no agentctl.

## Entregue

- `migrations/012_channel_imports.sql`: tabela aditiva de importações do canal.
- `lib/channel-inbox.ts`: varredura de `inbox/<slug>/` com recusa de symlink,
  traversal, limites RNF4 e magic bytes inválidos.
- `lib/report-import-service.ts`: importação idempotente (uma transação por
  relatório, vault temp + rename); conteúdo novo no mesmo caminho gera versão
  nova e marca a anterior `superseded`.
- `lib/settings.ts` + `app/api/settings/route.ts`: setting `channel_dir`
  validado.
- `app/api/zetels/[id]/reports/import/route.ts` e botão em
  `components/ArquivosPanel.tsx`.
- Follow-up `80e5b65`: o limite de parse do inbox conta só relatórios novos;
  leituras só de hash ficam limitadas por tamanho.

## Gates

- FULL (focados, typecheck, test:ci, coverage, build, diff-check): PASS
  (`evidence/003-validation.json`).
- Reviews engineering-quality e spec-compliance: PASS
  (`reviews/003-aggregate.json`).
- `80e5b65` revalidado com testes focados (38 testes) antes do push.

## Próximo

- 004: "Buscar do canal" (sync do clone local, sem merge, sem credencial).
- 005: curadoria por IA sobre os relatórios importados.
