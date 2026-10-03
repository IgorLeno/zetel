---
id: "001"
title: "Voz: TTS natural com gpt-4o-mini-tts"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: STANDARD
profile_justification: "Troca de modelo e novo parametro no mesmo provedor e nova chave em settings (chave/valor, sem migracao); nao toca state machine, seguranca, escrita atomica nem schema."
validation: PASS
validated_at: "2026-10-03T23:38:30.859Z"
---

## Objetivo
Fala da parceira mais natural: `gpt-4o-mini-tts` com voz `marin` e instrução
de tom padrão ajustável, sem trocar de provedor.

## Perfil planejado
`execution_profile` planejado: `STANDARD`. Justificativa: troca de modelo e
novo parâmetro no mesmo provedor e nova chave em `settings` (chave/valor, sem
migração); não toca state machine, segurança, escrita atômica nem schema.

## Criterios de aceitacao
- Sem configuração salva, a chamada à OpenAI usa `model: gpt-4o-mini-tts`,
  `voice: marin` e `instructions` igual à instrução padrão.
- `tts_instructions` salva substitui a instrução padrão; vazia apaga e volta
  ao padrão; acima de 2000 caracteres ou não-string responde 400.
- Com `tts_model` `tts-1` ou `tts-1-hd`, o corpo enviado não contém
  `instructions`.
- `GET /api/settings` devolve `tts_model`, `tts_voice` e `tts_instructions`
  efetivos.
- Logs da rota TTS continuam só com `chars`; a instrução nunca é logada.

## Testes
Unit da rota TTS e de `synthesizeSpeech` com `fetch` falso; integração do
`PUT`/`GET /api/settings` para `tts_instructions`. Escuta humana no app.

## Gates
STANDARD: focados, `pnpm typecheck`, `git diff --check`.

## Escopo
`lib/openai-voice.ts`, `app/api/voice/tts/route.ts`,
`app/api/settings/route.ts`, `tests/unit/voice/`, `tests/integration/`,
`.agent/ARCHITECTURE.md`. Fora: `VOICE_STYLE_PROMPT`, STT, perfis de tutor,
UI de configuração.

## Riscos
Sotaque pode escorregar para Portugal ou soar neutro demais (instrução
explícita mitiga; ajuste via `tts_instructions`). Tom pode variar entre frases
sintetizadas separadamente (instrução fixa reduz).
