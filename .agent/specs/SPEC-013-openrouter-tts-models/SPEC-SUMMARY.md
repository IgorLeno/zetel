# SPEC-013-openrouter-tts-models Summary

Titulo: Voz: modelos TTS do OpenRouter na aba Voz
Kind: mini
Status: PENDING_APPROVAL

Revisa D11–D12: TTS ganha provedor por modelo (OpenAI | OpenRouter) via
catálogo estático em `lib/tts-options.ts`. Cadastra `google/gemini-3.8-flash-tts`
(30 vozes, sem tom). Rota TTS roteia por provedor e ignora o tom sem erro em
modelo que não aceita; `PUT /api/settings` valida voz por modelo;
`/api/voice/status` informa chave por provedor. Aba Voz agrupa modelos por
provedor e filtra vozes. STT segue Whisper.
