---
id: "001"
title: "Chave Gemini, voz Live e status no servidor e em Configuracoes"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Altera lib/config.ts e o armazenamento de chaves (sempre FULL pelo adapter); nova chave Gemini, setting live_voice e contrato aditivo de status."
validation: PASS
validated_at: "2026-10-17T12:48:15.579Z"
---

## Objetivo
Igor salva a chave Gemini (AI Studio) e escolhe a voz Live em
`/configuracoes`; o servidor sabe se o Live está disponível, sem que a chave
saia dele.

## Perfil planejado
`execution_profile` planejado: `FULL`, `reviews_requested: 1` (`security`).
Justificativa: altera `lib/config.ts` e o armazenamento de chaves (sempre
FULL pelo adapter).

## Criterios de aceitacao
- `resolveGeminiCredential()` → `{ configured, source, key }`; config
  `GEMINI_API_KEY` tem prioridade sobre env `GEMINI_API_KEY`; vazio/espaços =
  não configurada.
- Salvar a chave Gemini grava em `~/.zetel/config` (600) pelo `writeConfig`
  existente; a resposta e o `GET` devolvem só `configured`/`source`; chave
  vazia/não string → 400; a chave OpenRouter não é tocada.
- `PUT /api/settings` aceita `live_voice` só entre as 30 vozes Gemini do
  catálogo; outra → 400. Sem valor salvo, a voz efetiva é `Kore`.
- `GET /api/voice/status` inclui `live: boolean`; campos atuais intactos.
- `/configuracoes` mostra bloco "Gemini Live": campo mascarado, estado
  configurada/origem e seletor de voz Live. A aba Voz (SPEC-013/002) não muda.
- Logs sem chave; nenhuma chave em SQLite, vault ou Git.
- `.agent/ARCHITECTURE.md` registra a chave Gemini e o modo Live (resumo das
  decisões D1–D11).

## Testes
Unit do resolvedor (config, env, prioridade, vazio), da rota de config Gemini
(salva, 400, resposta sem chave), do status (`live`), integração de
`PUT /api/settings` com `live_voice` válido/ inválido. Teste de componente do
bloco em `ConfiguracoesForm`, se o padrão do projeto tiver.

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
`pnpm test:coverage`, `git diff --check`. UI conferida no navegador.

## Escopo
`lib/config.ts`, `app/api/config/` (rota existente ou irmã para Gemini),
`app/api/settings/route.ts`, `app/api/voice/status/route.ts`,
`lib/live-options.ts` (novo: modelo, limites, voz padrão; reusa vozes de
`lib/tts-options.ts`), `components/ConfiguracoesForm.tsx`, testes,
`.agent/ARCHITECTURE.md`. Fora: `components/VozPanel.tsx`, STT/TTS, chat.

## Riscos
Mexer no módulo de chaves pode afetar a OpenRouter: testes de regressão do
resolvedor OpenRouter e do `writeConfig` continuam verdes. Lista de vozes
compartilhada com o TTS: mudança no catálogo afeta os dois (intencional).
