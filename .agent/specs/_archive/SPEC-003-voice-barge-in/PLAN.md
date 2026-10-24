# Plano: Voz: barge-in por detecção de fala

## Arquitetura
- `lib/voice-activity.ts`: detector puro sobre quadros de RMS (calibração do
  piso de ruído nos primeiros ~300 ms, limiar = max(piso × k, mínimo
  absoluto), disparo após fala sustentada ≥ ~250 ms, ignora picos curtos,
  reset por turno).
- `hooks/useBargeIn.ts`: enquanto o estado de voz for pensando/falando, o mic
  estiver ligado e o barge-in habilitado, abre `getUserMedia` com
  cancelamento de eco + `AudioContext`/`AnalyserNode` e alimenta o detector;
  ao disparar chama `onBargeIn` uma vez por turno. Fecha tracks e contexto ao
  sair desses estados, ao desligar o mic e no unmount.
- `components/ChatPanel.tsx`: `onBargeIn` reutiliza `stopPartner` e reabre
  `startListening`; toggle de barge-in junto aos controles de voz; prefs em
  `zetel_voice_prefs`.

## Verificacao
Unit: `tests/unit/voice/voice-activity.test.ts` e teste do controlador com
fakes. Gates FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
`pnpm test:coverage`, `git diff --check`. Validação humana no Chrome.
