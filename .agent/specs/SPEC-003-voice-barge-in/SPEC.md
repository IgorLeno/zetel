# SPEC-003-voice-barge-in: Voz: barge-in por detecção de fala

Kind: `mini`

## Problema
Na conversa por voz, a parceira só pode ser interrompida pelo botão
`[■ Parar]`: o microfone é desligado enquanto ela pensa ou fala e só volta ao
fim do TTS. A conversa não flui como uma conversa falada. Emenda de
2026-09-30 ao `prd-v5.md` (R11), aprovada por Igor Fernandes em chat, trouxe
o barge-in para a V1.

## Resultado esperado
Com microfone e voz automática ligados, o usuário fala por cima da parceira e
ela para, volta a ouvir e responde à nova fala, sem clique. A interrupção tem
a mesma semântica de `[■ Parar]` (SPEC-001 RF7): áudio para, frases futuras
descartadas, SSE abortado, parcial persistido com `meta.interrupted=true`,
entrada liberada. A resposta interrompida não é retomada.

## Limites
- Fora: retomar a resposta interrompida de onde parou; troca de provedor de
  voz; streaming de áudio novo; STT no servidor; mudança na rota de chat,
  banco ou contratos de API.
- Detecção local no navegador; nenhum áudio sai do dispositivo por causa do
  barge-in. Logs só contagens (regra 6 do `CLAUDE.md`).
- Depende do comportamento de `[■ Parar]` já em `main` (SPEC-001 tarefa 008,
  commit `a7fb63e`), reutilizado sem alteração de contrato.
- Limitação aceita: o início da fala que interrompe pode se perder até o
  reconhecimento Web Speech reiniciar.

## Verificacao
Testes unitários do detector de atividade de voz e do controlador de
barge-in com fakes; gates FULL; validação humana no Chrome com e sem fone
(interromper no meio da fala; a parceira não se autointerrompe com o próprio
áudio).

## Decisoes aprovaveis
- D1: detecção por nível RMS de `getUserMedia` com `echoCancellation`,
  `noiseSuppression` e `autoGainControl`, em vez de manter o Web Speech
  ativo durante o TTS (evita transcrever a própria voz da parceira).
- D2: calibração do ruído de fundo por turno, limiar conservador e duração
  mínima de fala sustentada antes de disparar.
- D3: barge-in chama a mesma rotina de parada do `[■ Parar]` e em seguida
  reabre a escuta; a parceira responde à nova fala.
- D4: preferência `bargeIn` em `zetel_voice_prefs`, padrão ligado; o usuário
  pode desligar. `[■ Parar]` continua disponível.
