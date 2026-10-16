---
id: "001"
title: "Catalogo TTS por provedor e roteamento OpenRouter no servidor"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: STANDARD
profile_justification: "Poucos módulos de voz, validação de entrada e contrato aditivo de status; usa o resolvedor de chave existente sem alterá-lo; sem state machine, escrita atômica, schema, banco ou migração."
validation: PASS
validated_at: "2026-10-16T21:56:15.823Z"
---

## Objetivo
Catálogo TTS com provedor por modelo e roteamento no servidor: com
`google/gemini-3.8-flash-tts` salvo, `/api/voice/tts` sintetiza pelo
OpenRouter sem tom e sem erro; com modelo OpenAI, nada muda.

## Perfil planejado
`execution_profile` planejado: `STANDARD`, `reviews_requested: 1`
(`engineering-quality`). Justificativa: poucos módulos de voz, validação de
entrada e contrato aditivo de status; usa o resolvedor de chave existente sem
alterá-lo; sem state machine, escrita atômica, schema, banco ou migração. A
revisão cobre uso da chave OpenRouter no novo endpoint e ausência de conteúdo
nos logs. Alterar `lib/config.ts` ou o armazenamento de chaves eleva para FULL.

## Criterios de aceitacao
- Catálogo: 3 modelos OpenAI (regras atuais de vozes/tom) + Gemini 3.8 Flash
  TTS (`openrouter`, 30 vozes, `supportsInstructions: false`, `defaultVoice:
  "Kore"`). Modelo fora do catálogo = OpenAI e regra antiga.
- `PUT /api/settings`: Gemini + voz Gemini → 200; Gemini + `marin` → 400;
  `gpt-4o-mini-tts` + `Kore` → 400; modelo desconhecido → 400; troca de modelo
  não apaga `tts_instructions`.
- `POST /api/voice/tts` com modelo efetivo Gemini: chama
  `https://openrouter.ai/api/v1/audio/speech` com Bearer da chave OpenRouter,
  `model`, `input`, `voice`, `response_format: "mp3"` e sem `instructions`,
  mesmo com `instructions` no corpo ou em `settings`; responde `audio/mpeg`.
- Sem chave OpenRouter e modelo efetivo Gemini → 503 `tts_unavailable`, sem
  chamar rede. Com modelo OpenAI, comportamento e testes da SPEC-005 intactos.
- Erro upstream do OpenRouter → 502 com mensagem genérica; log só
  `provider`, `model` e status.
- `GET /api/voice/status` → `{ tts, sttServer, providers: { openai,
  openrouter } }`; `tts` segue o provedor do modelo efetivo.
- Logs sem texto, instrução, corpo upstream ou chave.
- `.agent/ARCHITECTURE.md` registra a revisão de D11–D12.

## Testes
`tests/unit/voice/tts-options.test.ts`,
`tests/unit/voice/openrouter-voice.test.ts` (novo),
`tests/unit/voice/tts-route.test.ts`, `tests/unit/voice/status-route.test.ts`,
`tests/integration/tts-settings.test.ts`. Fetch sempre simulado.
Smoke live autorizado (D10): uma chamada real, `ZETEL_E2E_MAX_CALLS=1`, fora
dos gates; registra só status, content-type e bytes.

## Gates
STANDARD: focados, `pnpm typecheck`, `pnpm test:ci` (`lib/tts-options.ts` é
compartilhado cliente/servidor), `git diff --check`. E2E live fora dos gates.

## Escopo
`lib/tts-options.ts`, `lib/openrouter-voice.ts` (novo),
`app/api/voice/tts/route.ts`, `app/api/settings/route.ts`,
`app/api/voice/status/route.ts`, testes acima, `.agent/ARCHITECTURE.md`.
Fora: `lib/config.ts`, `lib/openai-voice.ts` (salvo re-export),
STT, `components/`, `hooks/`.

## Riscos
Formato/forma da resposta do OpenRouter verificado só por documentação até o
smoke autorizado (D10) (mitigação: `response_format` explícito e teste do contrato).
Catálogo pode envelhecer (vozes mudam): lista num único módulo; voz removida
vira 400 na gravação e 502 na síntese. Latência maior por frase no chat.
