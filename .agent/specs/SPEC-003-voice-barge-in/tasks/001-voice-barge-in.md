---
id: "001"
title: "Voz: barge-in por detecção de fala"
status: REVIEWING
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
execution_profile: FULL
profile_justification: "Altera a state machine de voz do cliente (pensando/falando -> ouvindo) e o ciclo de vida do microfone; risco de regressao do maos-livres e de autointerrupcao por eco. Sem mudanca de API, banco ou contrato de meta.interrupted."
validation: PASS
validated_at: "2026-09-30T13:16:00.338Z"
---

## Objetivo
Conversa por voz fluida: o usuário fala por cima da parceira e ela para, ouve
e responde à nova fala, sem clicar em `[■ Parar]`.

## Perfil planejado
`execution_profile` planejado: `FULL`. Justificativa: altera a state machine de voz do cliente (pensando/falando → ouvindo) e o ciclo de vida do microfone; risco de regressão do mãos-livres e de autointerrupção por eco.

## Criterios de aceitacao
- Com mic e voz automática ligados, fala sustentada durante pensando/falando interrompe com a mesma semântica de `[■ Parar]`: áudio para, frases futuras descartadas, SSE abortado, parcial persistido com `meta.interrupted=true`, entrada liberada.
- Após o barge-in o reconhecimento volta a ouvir e a próxima fala final gera turno novo; a resposta interrompida não é retomada.
- Detecção local (`getUserMedia` com `echoCancellation`, `noiseSuppression`, `autoGainControl` + RMS); nenhum áudio enviado ao servidor por causa do barge-in.
- Calibração, limiar conservador e duração mínima: picos curtos e eco atenuado do próprio TTS não disparam.
- Preferência `bargeIn` (padrão ligado) pode ser desligada; `[■ Parar]` continua disponível.
- Tracks e `AudioContext` fechados ao sair de pensando/falando, ao desligar o mic e no unmount.
- Logs só contagens; nunca áudio ou transcrição.

## Testes
Unit do detector (silêncio, ruído constante, pico curto, fala sustentada, eco abaixo do limiar, recalibração por turno) e do controlador com fakes (dispara stop + listen uma vez por turno; não dispara em idle/listening/stopped nem desligado; cleanup para as tracks). Validação humana no Chrome com e sem fone.

## Gates
Gates FULL completos: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`, `pnpm test:coverage`, `git diff --check`.

## Escopo
`lib/voice-activity.ts`, `hooks/useBargeIn.ts`, `components/ChatPanel.tsx`, `tests/unit/voice/`. Fora: retomar resposta interrompida, troca de provedor, streaming de áudio novo, STT no servidor, rota de chat.

## Riscos
Autointerrupção por eco em alto-falante sem AEC eficaz (mitigar com limiar, duração mínima e opção de desligar); perda do início da fala interruptora.
