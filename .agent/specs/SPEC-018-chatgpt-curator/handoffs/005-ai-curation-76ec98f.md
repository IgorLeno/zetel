---
task_id: "005"
delivery_commit: 76ec98f
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-23T03:32:00.000Z
---

# Handoff 005 — Curadoria por IA

## Tarefa

- ID: 005
- Perfil: FULL, reviews_requested: 1 (engineering-quality com foco em
  segurança; o agentctl não tem eixo `security`).
- 005 liberada DRAFT → READY pelo domínio do agentctl e sessão fechada
  DONE → PUSHED → SESSION_CLOSED pelo mesmo domínio; o Igor pediu
  explicitamente (2026-10-22) a execução de 005–008 com commit direto em
  main, sem interrupções.

## Entregue

- `lib/curation-service.ts`: `buildReportCatalog` (segmentação da ingestão,
  anchor de bloco `<anchor da página>-b<n>`, `content_hash`),
  `buildCurationPrompt` (blocos em `<fonte>` neutralizados, teto de 120 mil
  caracteres), `validateCandidates` (tudo ou nada), `curateImport` e
  `curateZetelReports`, `resolveCurationModel`.
- `channel_imports.status`: `imported` → `curated` | `curation_failed` →
  `superseded`; `report-import-service` agora supera qualquer status vigente.
- `curation_model` em `PUT/GET /api/settings` (com histórico); vazio = modelo
  efetivo do chat.
- Payload gravado em `curation_candidates.payload`: campos do tipo +
  `source: { contentHash, section }` do servidor.

## Gates

- FULL: PASS (`evidence/005-validation.json`). Review r1 PASS com F001–F004
  (symlink em diretório intermediário, catch amplo, catálogo vazio, testes
  adversariais), todos corrigidos; r2 PASS (`reviews/005-aggregate.json`).

## Pendências não bloqueantes

- Não há rota nem UI de curadoria ainda (tarefa 006).
- Candidatos idênticos não são deduplicados (todos pendentes de revisão).
- `pnpm build` do gate reescreveu `.next/` com o dev server do Igor ativo
  (porta 3000): reiniciar o `next dev`.

## Próximo

- 006: painel Curadoria, rota `GET|PATCH /api/zetels/[id]/curation` e
  gravação no vault com proveniência do servidor.
