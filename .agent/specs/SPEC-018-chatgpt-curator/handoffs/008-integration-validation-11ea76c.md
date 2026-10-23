---
task_id: "008"
delivery_commit: 11ea76c
followup_commit: 85a5017
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-23T05:00:00.000Z
---

# Handoff 008 — Fluxo integrado, E2E não-live e validação humana

## Tarefa

- ID: 008
- Perfil: STANDARD, reviews_requested: 1 (uma rodada).
- Lifecycle como nas anteriores, sob o pedido do Igor (2026-10-22) de
  executar 005–008 sem interrupções.

## Entregue

- `e2e/curator/curator.spec.ts` (escopo previa `tests/e2e/curator.spec.ts`;
  o projeto mantém E2E em `e2e/`): relatório num bare local → "Buscar do
  canal" → "Importar relatórios" → "Curar relatórios" → editar e confirmar
  nota e conceito → prévia do `CONTEXTO.md` (clone limpo) → publicar →
  commit conferido no remoto.
- `e2e/curator/mock-openrouter.mjs`: preload que mocka a OpenRouter e recusa
  qualquer host externo.
- Projeto Playwright `e2e-curator` (`pnpm test:e2e:curator`), `next dev`
  próprio na 3005 com `ZETEL_HOME` temporário e `distDir` `.next-e2e`
  (`ZETEL_NEXT_DIST_DIR` em `next.config.ts`), Chrome do sistema.
- `docs/CHATGPT_REPORT_TEMPLATE.md`: passos do lado do Zetel.
- Follow-up `85a5017` (achados da review, rodada única do STANDARD): raiz
  temporária sempre gerada pelo config e só apagada com o prefixo próprio;
  git hermético no E2E; comando documentado em `.agent/QUALITY.md`.
  Revalidado com o E2E (PASS) e typecheck.

## Gates

- STANDARD: E2E do curador, focados, typecheck, test:ci, diff-check: PASS
  (`evidence/008-validation.json`). Review r1 PASS (`reviews/008-aggregate.json`).

## Validação humana — PENDENTE (não bloqueia gates, conforme a tarefa)

Precisa do Igor com o ChatGPT e o repositório real do canal (SSH):

1. Projeto do ChatGPT com a instrução do template; conversar e pedir
   "Gere o Relatório Zetel".
2. Enviar `.md` + imagens para `inbox/<slug>/` no repositório do canal.
3. No Zetel: Buscar do canal → Importar relatórios (sem ajuste manual) →
   Curadoria → Curar → confirmar → Publicar contexto.
4. Nova conversa no ChatGPT lendo `contexto/<slug>/CONTEXTO.md`: deve citar
   conteúdo confirmado.
5. Registrar resultado e eventuais ajustes no template.

## Pendências não bloqueantes

- O `pnpm build` dos gates FULL (005–007) reescreveu `.next/` com o dev
  server do Igor ativo (porta 3000): reiniciar o `next dev`.
- O E2E do curador regrava `next-env.d.ts` (ignorado pelo Git) para
  `.next-e2e`; o `next dev` normal o restaura ao subir.

## Próximo

- SPEC-018 com todas as tarefas fechadas; falta só a validação humana acima.
  D11 (flag de chat/voz) segue para a SPEC-019.
