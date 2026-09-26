---
id: "012"
title: "Integração do fluxo principal e E2E não-live"
status: READY
blocked_by: ["004", "006", "007", "009", "011"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Montar a experiência de sessão de estudo completa e provar o cenário do PRD v5 §21 automaticamente.

## Perfil planejado

`execution_profile` planejado: `STANDARD`. Justificativa: Integração de UI e teste E2E com mocks; sem migration nem contrato novo. Elevar a FULL se exigir mudança de contrato.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Layout material + parceira com prioridade visual do R33; transcript recolhível sem afetar persistência.
- Entrada do Zetel oferece Continuar sessão / Nova sessão.
- E2E Playwright com OpenRouter e voz mockados cobre os passos automatizáveis do §21.
- Fluxo antigo continua acessível.

## Testes

E2E não-live do cenário principal; regressão das suítes existentes.

## Gates

Focados; `pnpm typecheck`; `pnpm test:ci`; E2E não-live; `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: `components/`, `app/zetel/[slug]/page.tsx`, `e2e/`.

Fora de escopo: Novas features; E2E live.

## Riscos

Flakiness de E2E com áudio; usar fakes determinísticos.
