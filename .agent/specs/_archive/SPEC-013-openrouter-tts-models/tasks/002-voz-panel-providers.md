---
id: "002"
title: "Aba Voz com modelos por provedor e tom condicional"
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
Na aba Voz, escolher modelos OpenAI ou OpenRouter com vozes filtradas pelo
modelo e campo de tom habilitado só quando o modelo aceita instruções.

## Perfil planejado
`execution_profile` planejado: `STANDARD`, `reviews_requested: 0`.
Justificativa: componente de UI isolado consumindo contratos da tarefa 001;
sem rota, persistência ou chave novas.

## Criterios de aceitacao
- Select de modelo com grupos "OpenAI" e "OpenRouter"; rótulo indica se aceita
  tom.
- Lista de vozes = vozes do modelo selecionado (30 no Gemini; 13 com a regra
  atual nos OpenAI). Trocar para modelo sem a voz atual seleciona a voz padrão
  dele e mostra aviso.
- Modelo sem tom: presets e textarea desabilitados com aviso de que o modelo
  usa o estilo natural da voz e o tom salvo volta a valer em modelos que
  aceitam; "Salvar" não altera `tts_instructions`; amostra não envia
  `instructions`.
- Sem chave do provedor do modelo selecionado (via `/api/voice/status`):
  aviso e "Ouvir amostra" desabilitado; "Salvar" permitido.
- Fluxos OpenAI da SPEC-005 (presets, contador, salvar, restaurar, amostra)
  continuam funcionando.

## Testes
Sem teste de componente no projeto; validação no navegador em
`/configuracoes`, aba Voz, cobrindo os critérios acima e a requisição da
amostra (200 ou erro tratado, sem travar a tela).

## Gates
STANDARD: `pnpm typecheck`, `git diff --check`; focados da tarefa 001 se
`lib/tts-options.ts` for tocado.

## Escopo
`components/VozPanel.tsx`, CSS mínimo se faltar classe existente. Fora:
rotas, `lib/`, `ChatPanel`, `useTtsQueue`.

## Riscos
Cada clique em "Ouvir amostra" é uma chamada paga (frase curta, só por ação
explícita). Nome de voz Gemini não descreve o timbre; escolha é de ouvido.
