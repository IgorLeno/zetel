---
task_id: "006"
delivery_commit: 29d01b2
remote: "origin/main (fast-forward, sem PR)"
closed_at: 2026-10-23T03:51:00.000Z
---

# Handoff 006 — Revisão humana da curadoria

## Tarefa

- ID: 006
- Perfil: FULL (elevado do STANDARD planejado: mudou `notes-service` e
  `concepts-service`, serviços de escrita no vault), reviews_requested: 1.
- Liberação, início e fechamento de sessão como na 005, sob o pedido do Igor
  (2026-10-22) de executar 005–008 sem interrupções.

## Entregue

- `lib/curation-review-service.ts`: `listCuration`, `decideCandidate`
  (reivindica + grava o vault na mesma transação), gravação em
  `notas-rapidas/` (`saveNote` com `origem: relatorio`), `conceitos/`
  (`saveConcept` com `ReportConceptProvenance`, cria ou acrescenta),
  `passo-a-passo/` e `questoes/` (temporário + `link`).
- `lib/notes-service.ts`: `origem` opcional (padrão `chat`).
- `lib/concepts-service.ts`: `ReportConceptProvenance`; rótulo "Formulação
  do relatório".
- `lib/curation-service.ts`: títulos/nomes/passos em uma linha;
  `parseCandidatePayload` exportado para validar edições.
- `app/api/zetels/[id]/curation/route.ts` (GET/POST/PATCH) e
  `components/CuradoriaPanel.tsx` na aba "Curadoria" da gaveta.

## Gates

- FULL: PASS (`evidence/006-validation.json`). Review r1 PASS com F001–F003
  (payload corrompido, escape em títulos, testes adversariais), corrigidos;
  r2 PASS (`reviews/006-aggregate.json`).

## Pendências não bloqueantes

- NITs r2: ARCHITECTURE não detalha escape só de `<` em títulos (F004);
  candidato corrompido fica `pending` e invisível até nova versão (F005);
  sem teste de rota do 500 `corrupted`, e `linkSync` exige FS com hard link
  (F006).
- UI não verificada no navegador nesta sessão: o dev server do Igor (3000)
  ficou com `.next/` reescrito pelo `pnpm build`; a 008 cobre por E2E.
- Nota do relatório vai como `rapida`; `modelo: curadoria` (o candidato não
  guarda o modelo usado).

## Próximo

- 007: `CONTEXTO.md` determinístico e publicação explícita.
