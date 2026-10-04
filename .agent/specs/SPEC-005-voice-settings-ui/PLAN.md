# Plano: Voz: secao de configuracao de voz com selecao validada

## Arquitetura
- `lib/tts-options.ts` (novo, puro): `TTS_MODELS`, `TTS_VOICES` (com flag de
  suporte a `tts-1*`), `isTtsModel`, `isTtsVoice`, `ttsVoiceSupportedBy`,
  `ttsModelSupportsInstructions`, `TTS_TONE_PRESETS` e
  `DEFAULT_TTS_MODEL`/`DEFAULT_TTS_VOICE`/`DEFAULT_TTS_INSTRUCTIONS`/
  `MAX_TTS_INSTRUCTIONS_CHARS` movidos para cá.
- `lib/openai-voice.ts`: re-exporta as constantes e
  `ttsModelSupportsInstructions`; sem mudança de comportamento.
- `app/api/settings/route.ts`: valida `tts_model`/`tts_voice` contra a lista
  e o par efetivo; mensagens de erro em pt-BR.
- `app/api/voice/tts/route.ts`: aceita `instructions` no corpo; valida
  `model`/`voice` do corpo; log continua só `chars`.
- `components/VozPanel.tsx` (novo) + aba "Voz" em
  `components/ConfiguracoesTabs.tsx`. Amostra via `fetch` → `Blob` →
  `Audio`, liberando a URL ao terminar.
- `.agent/ARCHITECTURE.md`: nota de voz atualizada (contrato do PUT e corpo
  do TTS).

## Verificacao
Unit: `tests/unit/voice/tts-options.test.ts` (novo),
`tests/unit/voice/tts-route.test.ts`. Integração:
`tests/integration/tts-settings.test.ts`. Gates STANDARD: focados,
`pnpm typecheck`, `git diff --check`. UI no navegador (porta 3001): aba,
filtragem de vozes por modelo, presets, contador, aviso `tts-1*`, salvar,
restaurar e requisição da amostra (status 200 ou erro tratado).
