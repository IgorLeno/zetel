---
id: "001"
title: "Preferências de UI em cookie"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: STANDARD
profile_justification: "Persistencia de preferencias de UI no cliente + modulo puro novo; sem state machine, escrita atomica, seguranca ou banco"
validation: PASS
validated_at: "2026-10-04T11:46:47.489Z"
---

## Objetivo
Preferências de voz do chat e do painel do material persistidas em cookie,
valendo em qualquer porta, com migração única do `localStorage` (SPEC D1–D3).

## Criterios de aceitacao
- Gravar uma preferência escreve o cookie correspondente (`Path=/`,
  `SameSite=Lax`, 1 ano) e não usa mais `localStorage`.
- Cookie presente vence; chave antiga do `localStorage` é removida.
- Sem cookie e com valor antigo: valor migrado para cookie e chave removida.
- Valor ausente/corrompido cai nos padrões atuais.
- `bargeIn` omitido ao salvar preserva o valor salvo.
- `localStorage`/`document.cookie` indisponíveis não lançam.

## Testes
- `tests/unit/ui/ui-prefs.test.ts` (novo); `tests/unit/voice/barge-in.test.ts`
  (regressão).

## Gates
- Focados, `pnpm typecheck`, `git diff --check`; validação no navegador.

## Escopo
- `lib/ui-prefs.ts` (novo), `components/ChatPanel.tsx`,
  `components/StudyShell.tsx`, `tests/unit/ui/ui-prefs.test.ts` (novo).

## Riscos
- Preferência salva só em outra porta (localStorage) não migra até ser aberta
  naquela porta; a primeira porta aberta define o cookie. Aceito.
