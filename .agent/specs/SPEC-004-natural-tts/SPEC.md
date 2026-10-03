# SPEC-004-natural-tts: Voz: TTS natural com gpt-4o-mini-tts

Kind: `mini`

## Problema
A fala da parceira usa `tts-1` com a voz `nova` e nenhuma direção de tom. O
resultado soa como locução lida, pouco natural, longe da referência do
ChatGPT Voice. Decisão em chat (Igor Fernandes, 2026-10-03): manter a OpenAI
como provedor e trocar o modelo por `gpt-4o-mini-tts`, que aceita
`instructions` de tom com custo por minuto equivalente ao `tts-1`
(~US$ 15–30/mês em 40–60 min/dia, estimativa).

## Resultado esperado
Sem configuração, a rota `/api/voice/tts` sintetiza com `gpt-4o-mini-tts`, voz
`marin` e uma instrução padrão de tom (português do Brasil, sotaque neutro e
pouco carregado, nunca de Portugal; timbre macio, calmo, calor moderado,
energia média, ritmo fluido; conversa, não locução). A instrução é ajustável
pela configuração `tts_instructions`; modelo e voz continuam ajustáveis por
`tts_model`/`tts_voice`.

## Limites
- Fora: reescrever o prompt de estilo oral do LLM (`VOICE_STYLE_PROMPT`);
  trocar `whisper-1` no STT; proatividade por perfil de tutor; UI de
  configuração de voz; streaming de áudio novo; outro provedor.
- `instructions` só é enviado a modelos que o aceitam: nunca a `tts-1` nem
  `tts-1-hd`, para quem configurou o modelo antigo explicitamente.
- Logs só contagens (regra 6 do `CLAUDE.md`); a instrução não é logada.
- Sem migração: `settings` já é chave/valor.

## Verificacao
Testes unitários da rota TTS e do cliente OpenAI com `fetch` falso (padrões,
instrução configurada, omissão para `tts-1`); teste de integração do
`PUT`/`GET /api/settings` para `tts_instructions`; gates STANDARD; escuta
humana no app.

## Decisoes aprovaveis
- D1: padrão `gpt-4o-mini-tts` + `marin`; usuários com `tts_model`/`tts_voice`
  salvos mantêm o valor salvo.
- D2: instrução padrão versionada em código; `tts_instructions` vazia volta ao
  padrão (mesma semântica de `tts_model`/`tts_voice`); limite de 2000
  caracteres.
- D3: `instructions` omitido para modelos `tts-1*`.
