---
id: "009"
title: "Ativar professora e starters"
status: READY
blocked_by: ["005", "008"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Permitir que a parceira inicie a interação a partir do foco atual por ação explícita.

## Perfil planejado

`execution_profile` planejado: `STANDARD`. Justificativa: Extensão localizada do contrato de chat (`starter` enumerado) e UI; sem migration.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Botão "Ativar professora" e starters Contextualize/Explique/Me faça uma pergunta/Vamos conversar.
- Chat aceita `starter` enumerado sem `userMessage`; persiste mensagem canônica com `meta.starter`.
- Resposta considera foco atual e perfil; em voz, fala normalmente e é interrompível.
- Nenhuma fala automática em mudança de página.

## Testes

Unit: mapeamento starter→instrução. Integração: rota de chat com starter e sem mensagem.

## Gates

Focados; `pnpm typecheck`; `pnpm test:ci` (rota compartilhada); `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: Rota de chat, `lib/chat-prompt.ts`, `components/ChatPanel.tsx`.

Fora de escopo: Proatividade automática por tempo/evento.

## Riscos

Starter virar mensagem vazia no histórico; testar canônico.
