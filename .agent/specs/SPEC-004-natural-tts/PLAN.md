# Plano: Voz: TTS natural com gpt-4o-mini-tts

## Arquitetura
- `lib/openai-voice.ts`: constantes `DEFAULT_TTS_MODEL`, `DEFAULT_TTS_VOICE`,
  `DEFAULT_TTS_INSTRUCTIONS`; `synthesizeSpeech` aceita `instructions`
  opcional e só o envia quando o modelo suporta (não `tts-1*`).
- `app/api/voice/tts/route.ts`: resolve modelo/voz/instrução por corpo →
  `settings` → padrão; log continua só com `chars`.
- `app/api/settings/route.ts`: `GET` expõe `tts_instructions` efetiva e
  padrões novos; `PUT` aceita `tts_instructions` (string, vazia apaga,
  ≤ 2000 caracteres).
- `.agent/ARCHITECTURE.md`: nota de voz atualizada.

## Verificacao
Unit: `tests/unit/voice/tts-route.test.ts`. Integração:
`tests/integration/tts-settings.test.ts`. Gates STANDARD: focados,
`pnpm typecheck`, `git diff --check`. Escuta humana no app.
