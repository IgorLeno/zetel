---
id: "002"
title: "Token efemero Live com contexto travado no servidor"
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
O servidor emite, para uma sessão de estudo e página, um token efêmero do
Gemini Live com modelo, voz, transcrição e system instruction travados; a
chave longa nunca vai ao navegador.

## Perfil planejado
`execution_profile` planejado: `FULL`, `reviews_requested: 1` (`security`).
Justificativa: emissão de credencial para o navegador e montagem de contexto
com conteúdo do usuário (regras 3, 5, 6, 9).

## Criterios de aceitacao
- `lib/live-context.ts` monta a instrução com prompt da parceira, perfil da
  sessão, `zetel_pages.content_text` da `pageIndex` (truncada como no chat) e
  memória global lida na chamada; nunca usa texto vindo do cliente.
- `lib/gemini-live-token.ts` chama `POST
  https://generativelanguage.googleapis.com/v1beta/auth_tokens` com
  `x-goog-api-key`, `uses: 1`, `newSessionExpireTime` +1 min, `expireTime`
  +16 min e `liveConnectConstraints` (`model: models/gemini-3.8-live`,
  `responseModalities: ["AUDIO"]`, voz, `inputAudioTranscription`,
  `outputAudioTranscription`, `sessionResumption`, system instruction).
  Timeout com abort; 2xx validado (token presente) antes de responder.
- `POST /api/zetels/[id]/live/token` `{ sessionId, pageIndex }`: 200 com
  `{ token, model, voice, expiresAt, maxSeconds: 900, pageIndex }` e
  `Cache-Control: no-store`; 400 entrada inválida; 404 zetel, sessão de outro
  zetel ou página inexistente; 503 `live_unavailable` sem chave (sem rede);
  502 genérico em erro/timeout upstream.
- Logs só `zetelId`, `sessionId`, `pageIndex`, `chars` da instrução e status;
  nunca token, chave, instrução, página ou memória.

## Testes
Unit de `live-context` (página do banco, memória lida, perfil, ignora campo
de conteúdo no corpo), de `gemini-live-token` (corpo exato, expirações com
relógio fixo, timeout, 2xx sem token → erro, 4xx/5xx), da rota (todos os
status acima, logs sem conteúdo). Fetch sempre simulado.

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
`pnpm test:coverage`, `git diff --check`.

## Escopo
`lib/live-context.ts`, `lib/gemini-live-token.ts`, `lib/live-options.ts`,
`app/api/zetels/[id]/live/token/route.ts`, testes. Reusa sem alterar
`lib/chat-prompt.ts` e `lib/study-session-service.ts`; se precisar alterar,
justificar no handoff. Fora: cliente, UI, persistência.

## Riscos
Formato de `liveConnectConstraints` verificado só pela doc (2026-10-17) até o
smoke da 003; constantes centralizadas. Instrução grande encarece cada turno:
mesma truncagem do chat.
