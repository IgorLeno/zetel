---
id: "006"
title: "Revisao humana dos candidatos e gravacao no vault"
status: DONE
blocked_by: ["005"]
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Eleva o STANDARD planejado: a gravacao de candidatos exige mudar os servicos de escrita no vault (origem relatorio em notes-service e concepts-service) e cria escrita nova em passo-a-passo/ e questoes/."
validation: PASS
validated_at: "2026-10-23T03:48:46.395Z"
---

## Objetivo
O Igor confirma, edita ou rejeita cada candidato; só confirmados vão ao vault.

## Perfil planejado
`STANDARD`, uma revisão `engineering-quality`. Eleva para `FULL` se exigir
mudança de schema ou nos serviços de escrita do vault.

## Criterios de aceitacao
- Painel "Curadoria" no Zetel lista pendentes por relatório.
- Confirmar nota/conceito usa `notes-service`/`concepts-service`; passo a passo
  e questão vão a `passo-a-passo/` e `questoes/` com escrita segura.
- Proveniência (relatório, anchor, data) reconstruída no servidor.
- Rejeitar não grava nada; decisão registrada em `curation_candidates`.

## Testes
Integração das ações; regressão de notas e conceitos.

## Gates
STANDARD: focados, `pnpm typecheck`, `pnpm test:ci` (serviços
compartilhados), `git diff --check`.

## Escopo
`app/api/zetels/[id]/curation/route.ts`, `components/CuradoriaPanel.tsx`,
ajuste mínimo no workspace, testes.

## Riscos
Divergência com cards do chat → reutilizar `NoteCard`/`ConceptCard`.
