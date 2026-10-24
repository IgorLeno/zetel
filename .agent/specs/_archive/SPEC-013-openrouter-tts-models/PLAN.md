# Plano: Voz: modelos TTS do OpenRouter na aba Voz

## Arquitetura
- `lib/tts-options.ts` (puro, seguro para o cliente): `TTS_PROVIDERS`;
  `TTS_MODELS` vira catálogo com `id`, `provider`, `label`,
  `supportsInstructions`, `voices`, `defaultVoice`; OpenAI mantém as 13 vozes
  e a regra `legacy`; entra `google/gemini-3.8-flash-tts` com as 30 vozes.
  Helpers: `ttsModelEntry`, `ttsProviderOf` (fora do catálogo → `openai`),
  `ttsVoicesFor`, `ttsDefaultVoiceFor`; `ttsModelSupportsInstructions` e
  `ttsVoiceSupportedBy` passam a consultar o catálogo com fallback na regra
  antiga. Exports atuais preservados.
- `lib/openrouter-voice.ts` (novo, servidor): `hasOpenRouterVoiceKey()` e
  `synthesizeSpeechOpenRouter({ apiKey, text, voice, model })` →
  `POST https://openrouter.ai/api/v1/audio/speech`, `response_format: "mp3"`,
  sem `instructions`; erro lança mensagem só com status.
- `lib/openai-voice.ts`: sem mudança de comportamento.
- `app/api/voice/tts/route.ts`: resolve modelo/voz, valida pelo catálogo,
  escolhe provedor, checa a chave do provedor (503), descarta o tom quando não
  suportado, passthrough `audio/mpeg`. Log `{ chars, provider, model }`; erro
  `{ provider, model, status }`.
- `app/api/settings/route.ts`: validação de `tts_model`/`tts_voice` pelo
  catálogo e par efetivo; nada mais muda.
- `app/api/voice/status/route.ts`: `{ tts, sttServer, providers }` (D7).
- `components/VozPanel.tsx`: `<optgroup>` por provedor, vozes do modelo, troca
  automática para `defaultVoice` com aviso, tom desabilitado com aviso quando
  não suportado (sem tocar o tom salvo), aviso de chave ausente via
  `/api/voice/status`, amostra sem `instructions` em modelo sem tom.
- `.agent/ARCHITECTURE.md`: nota de Voz registra a revisão de D11–D12, o
  catálogo por provedor e o novo contrato de status.

## Verificacao
- Tarefa 001 (servidor): `tests/unit/voice/tts-options.test.ts`,
  `tests/unit/voice/openrouter-voice.test.ts` (novo),
  `tests/unit/voice/tts-route.test.ts`, `tests/unit/voice/status-route.test.ts`,
  `tests/integration/tts-settings.test.ts`; `pnpm typecheck`; `pnpm test:ci`;
  `git diff --check`. Fetch sempre simulado; nenhuma chamada paga.
- Tarefa 002 (UI): `pnpm typecheck`, `git diff --check` e validação no
  navegador em `/configuracoes` (aba Voz): grupos de modelos, 30 vozes no
  Gemini, troca de voz automática, tom desabilitado com aviso, aviso de chave,
  salvar/restaurar, requisição da amostra (200 ou erro tratado).
- Tarefa 001: um smoke live pago e único (D10), fora dos gates, registrando
  só status, content-type e bytes.
