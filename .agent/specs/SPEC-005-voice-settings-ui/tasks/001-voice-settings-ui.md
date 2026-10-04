---
id: "001"
title: "Voz: secao de configuracao de voz com selecao validada"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: STANDARD
profile_justification: "UI isolada (aba Voz) e validacao de entrada em PUT /api/settings e POST /api/voice/tts; chave/valor sem migracao; nao toca state machine, escrita atomica, seguranca nem schema."
validation: PASS
validated_at: "2026-10-04T00:23:14.958Z"
---

## Objetivo
Aba "Voz" em Configurações para escolher modelo, voz e tom da parceira por
seleção validada, ouvir uma amostra sem salvar, salvar e restaurar o padrão.

## Perfil planejado
`execution_profile` planejado: `STANDARD`. Justificativa: componente de UI
isolado e validação de entrada em `PUT /api/settings` e
`POST /api/voice/tts`; chave/valor sem migração; não toca state machine,
escrita atômica, segurança nem schema.

## Criterios de aceitacao
- Aba "Voz" lista os 3 modelos e as 13 vozes; com `tts-1*`, `ballad`,
  `verse`, `marin` e `cedar` ficam desabilitadas e o tom fica desabilitado
  com aviso; trocar para `tts-1*` com voz exclusiva selecionada exige escolher
  outra antes de salvar/ouvir.
- Presets de tom preenchem o texto; editar o texto vira "Personalizado";
  contador `n/2000` impede passar do limite.
- "Ouvir amostra" envia `text`, `model`, `voice` e `instructions` a
  `/api/voice/tts` sem gravar `settings`; erro (sem chave, 4xx/5xx) aparece
  como feedback, sem travar a tela.
- "Salvar" grava as três chaves; tom igual ao padrão grava vazio.
  "Restaurar padrão" apaga as três.
- `PUT /api/settings`: modelo/voz fora da lista → 400; par efetivo
  incompatível → 400; válidos → 200 e `GET` reflete.
- `POST /api/voice/tts`: `instructions` do corpo vence `settings`; > 2000 ou
  não-string → 400; modelo/voz do corpo inválidos ou incompatíveis → 400.
- Logs sem texto, instrução ou chave.

## Testes
`tests/unit/voice/tts-options.test.ts`, `tests/unit/voice/tts-route.test.ts`,
`tests/integration/tts-settings.test.ts`. UI validada no navegador
(`/configuracoes`, aba Voz).

## Gates
STANDARD: focados, `pnpm typecheck`, `git diff --check`.

## Escopo
`lib/tts-options.ts`, `lib/openai-voice.ts`, `app/api/settings/route.ts`,
`app/api/voice/tts/route.ts`, `components/VozPanel.tsx`,
`components/ConfiguracoesTabs.tsx`, CSS mínimo se faltar classe existente,
testes acima, `.agent/ARCHITECTURE.md`. Fora: padrões de voz/tom, STT,
`VOICE_STYLE_PROMPT`, `ConfiguracoesForm`.

## Riscos
Lista de vozes pode mudar na OpenAI (lista centralizada num único módulo;
voz removida passa a dar 400 na gravação e 502 na síntese). Amostra gasta
uma chamada paga por clique (frase curta, só por ação explícita).
