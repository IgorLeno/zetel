---
id: "005"
title: "Study sessions e continuidade"
status: SESSION_CLOSED
blocked_by: ["001"]
writer: null
reviewer: null
commit: e94866f1b9a44944ac0e5b879f3c21cc20680a12
push: "origin/main (PR #20 merge d49495c1eb29a2a79975bff662e0d231a56419de; PR #21 merge 7a1a8f2af38b84c359c4bcde1c7c9ef5fb124139)"
review_result: NOT_RUN
handoff: .agent/specs/SPEC-001-conversational-learning-v1/handoffs/005-study-sessions-e94866f.md
execution_profile: FULL
profile_justification: "migration com backfill em chat_messages + mudança do contrato de persistência e escopo do chat/sessões"
validation: FAIL
validated_at: "2026-09-27T11:17:18.503Z"
---

## Objetivo

Introduzir sessões de estudo nomeáveis com Continuar/Nova sessão e histórico escopado por sessão.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Migration com backfill de `chat_messages` e novas rotas de persistência.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Migration cria `study_sessions` e `chat_messages.session_id`; backfill `legacy-<zetel_id>` para Zetels com mensagens.
- Rotas listar/criar/renomear/atualizar foco e perfil/arquivar sessão.
- Chat exige/resolve `sessionId` pertencente ao Zetel; histórico e janela por sessão.
- Continuar sessão restaura foco (arquivo/página), perfil e mensagens; Nova sessão não apaga memória/notas/conceitos.
- Título sugerido determinístico (documento · página · data), editável; nome manual persistido.
- `PATCH` de meta verifica que a mensagem pertence ao Zetel/sessão.
- "Limpar histórico" passa a agir na sessão atual.

## Testes

Integração: migration sobre banco legado, rotas de sessão, chat escopado, PATCH de mensagem alheia rejeitado. Unit: sugestão de título.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `migrations/007_*.sql`, `lib/study-session-service.ts`, `lib/chat-service.ts`, `app/api/zetels/[id]/sessions/`, rota de chat, `components/ChatPanel.tsx`.

Fora de escopo: Resumo de sessão por LLM, perfis, retrieval.

## Riscos

Backfill em bancos grandes; UI de seleção de sessão mínima (integração final em 012).
