---
id: "001"
title: "Contratos V1 na arquitetura"
status: SESSION_CLOSED
blocked_by: []
writer: null
reviewer: null
commit: 5df158a6c41d91218176622f09fd0a4722e35bc4
push: origin/docs/spec-001-conversational-learning-v1
review_result: NOT_REQUIRED
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/001-contratos-v1-5df158a.md
execution_profile: FAST
profile_justification: "Somente documentação: registra D1–D13 aprovadas em .agent/ARCHITECTURE.md"
validation: PASS
validated_at: "2026-09-26T11:18:33.745Z"
---

## Objetivo

Registrar em `.agent/ARCHITECTURE.md` os contratos aprovados da SPEC-001 (PDF, foco, sessões, perfis, conceitos, citações, voz) para que sessões futuras não dependam desta spec inteira.

## Perfil planejado

`execution_profile` planejado: `FAST`. Justificativa: Somente documentação: registra em `.agent/ARCHITECTURE.md` decisões D1–D13 já aprovadas; sem código, banco ou contrato executável alterado.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Seção "Conversational Learning V1" em `.agent/ARCHITECTURE.md` com D1–D13 resumidas e links para SPEC/PLAN.
- Invariantes existentes inalteradas; novas invariantes: fonte é dado, proveniência server-side, conceito só com confirmação.
- Nenhum arquivo em `app/`, `components/`, `lib/`, `migrations/` alterado.

## Testes

Verificação estática: `git diff --stat` restrito a `.agent/ARCHITECTURE.md` (e handoff).

## Gates

`git diff --check`.

## Escopo

Arquivos ou áreas prováveis: `.agent/ARCHITECTURE.md`.

Fora de escopo: Código, migrations, novas specs.

## Riscos

Divergir da SPEC aprovada; resolver citando SPEC como autoridade.
