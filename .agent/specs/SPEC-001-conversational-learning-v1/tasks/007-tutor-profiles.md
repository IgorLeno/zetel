---
id: "007"
title: "Perfis do tutor"
status: VALIDATING
blocked_by: ["005"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
execution_profile: FULL
profile_justification: "Migration (tutor_profiles) e mudança do contrato de prompt."
validation: FAIL
validated_at: "2026-09-30T08:40:05.439Z"
---

## Objetivo

Entregar perfis built-in e personalizados com seis eixos e tom, ajustáveis por sessão e com efeito real no prompt.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Migration (`tutor_profiles`) e mudança do contrato de prompt.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Seis built-ins imutáveis (Conversa Livre, Professor Socrático, Explicador, Resolver Comigo, Revisão Rápida, Professor Profundo) em código.
- Eixos 0–4 e tom 0–2 validados; compilação determinística em instruções por nível.
- Ajuste só para a sessão (`profile_overrides`); "Salvar como novo perfil"; editar personalizado; built-in nunca alterado.
- UI com barras editáveis e radar SVG; fora da área principal.
- Teste prova que níveis distintos produzem instruções distintas no system prompt enviado ao OpenRouter mockado.

## Testes

Unit: validação e compilação de perfil. Integração: rotas de perfis, override de sessão, prompt do chat.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `migrations/009_*.sql`, `lib/tutor-profiles.ts`, `app/api/tutor-profiles/`, `components/TutorProfile*.tsx`, `lib/chat-prompt.ts`.

Fora de escopo: Comandos naturais que alteram perfil ("vai mais fundo"), marketplace.

## Riscos

Instruções longas demais; manter fragmentos curtos e testados.
