---
id: "008"
title: "Voz: Parar, cancelamento e estados"
status: READY
blocked_by: ["001"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Tornar a interrupção confiável e os estados de voz claros, sem trocar provedores.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Muda persistência da rota de chat em abort (narrativa parcial) e o contrato de `/api/voice/status`.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- `[■ Parar]` visível em pensando/falando; interrompe áudio imediatamente.
- Frases que chegarem após Parar não são enfileiradas (flag de turno cancelado).
- Parar aborta o fetch SSE; servidor persiste narrativa parcial com `meta.interrupted=true`.
- Entrada por texto/voz liberada imediatamente após Parar.
- Estados ouvindo/pensando/falando/parado/erro visíveis e acessíveis.
- `/api/voice/status` → `{ tts, sttServer }`; microfone Web Speech não depende da chave OpenAI.
- Marcadores `[fonte:ID]` e Markdown não são falados.

## Testes

Unit: `useTtsQueue`/controlador de turno com fakes (cancel durante stream, sem retomada). Integração: rota de chat com abort persiste parcial.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `hooks/useTtsQueue.ts`, `components/ChatPanel.tsx`, `app/api/voice/status/route.ts`, rota de chat.

Fora de escopo: Barge-in acústico, troca de provedor, streaming de áudio novo.

## Riscos

Regressão do mãos-livres; cobrir com testes antes da mudança.
