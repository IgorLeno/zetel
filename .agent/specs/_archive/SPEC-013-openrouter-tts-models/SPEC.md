# SPEC-013-openrouter-tts-models: Voz: modelos TTS do OpenRouter na aba Voz

Kind: `mini`

## Problema
A aba Voz (SPEC-005) só oferece os três modelos TTS da OpenAI. Igor quer
experimentar modelos TTS do OpenRouter, começando pelo Gemini 3.8 Flash TTS
(`google/gemini-3.8-flash-tts`), escolhendo-os na mesma tela, sem editar
`settings` à mão e sem perder o que já funciona com a OpenAI. A decisão
D11–D12 de `.agent/ARCHITECTURE.md` ("sem troca de provedor na V1") impede isso
hoje e precisa ser revista de forma explícita.

## Resultado esperado
- A aba Voz lista os modelos agrupados por provedor: **OpenAI**
  (`gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`, como hoje) e **OpenRouter**
  (`google/gemini-3.8-flash-tts`).
- A lista de vozes mostra só as vozes do modelo selecionado. Para o Gemini 3.8
  Flash TTS: as 30 vozes do catálogo público do OpenRouter (Zephyr, Puck,
  Charon, Kore, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus,
  Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia,
  Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi,
  Vindemiatrix, Sadachbia, Sadaltager, Sulafat).
- Tom: se o modelo aceita instruções, usa o `tts_instructions` atual. Se não
  aceita (Gemini nesta spec, `tts-1*` como hoje), o campo de tom fica
  desabilitado com aviso, a síntese segue sem tom e sem erro, e o tom salvo
  continua guardado para quando voltar a um modelo que aceita.
- Com o Gemini salvo, a fala da parceira no chat e a amostra da aba Voz saem
  pelo OpenRouter; com modelo OpenAI, tudo continua como hoje.
- STT continua Whisper/OpenAI, sem mudança.

## Limites
- Fora: STT por outro provedor; descoberta dinâmica de modelos ou vozes pela
  API do OpenRouter (ver D2); injetar o tom no texto falado; velocidade,
  formato, idioma e clonagem de voz; UI de chave (a chave OpenRouter continua
  na configuração existente); mudar `DEFAULT_TTS_*` ou os presets de tom;
  outros modelos TTS do OpenRouter além dos listados em D2.
- Fora (specs futuras, só registro): ferramentas da parceira — definição com
  popup de confirmação, formulário/questões no painel lateral, busca web
  automática marcada como externa (SPEC-014); imagem no painel lateral
  (SPEC-015); modo Live com Gemini Live, token efêmero no navegador e
  transcrição salva (SPEC-016).
- Sem migração: `settings` segue chave/valor (`tts_model`, `tts_voice`,
  `tts_instructions`). Valor salvo antigo fora do catálogo continua sendo lido
  como OpenAI (comportamento da SPEC-005).
- Chave OpenRouter continua fora de SQLite, vault e Git; lida só pelo
  resolvedor existente. Nenhuma chave nova.
- Logs só IDs/contagens (regra 6): `chars`, `provider`, `model` e status HTTP;
  nunca texto, instrução, corpo de erro upstream ou chave.
- E2E live/OpenRouter não roda nos gates; só com `ZETEL_E2E_LIVE=1`,
  `OPENROUTER_API_KEY`, `ZETEL_E2E_MAX_CALLS` finito e autorização humana
  explícita.

## Verificacao
Unit do catálogo/compatibilidade, do cliente OpenRouter (fetch simulado), da
rota TTS (roteamento por provedor, tom ignorado sem erro, 503 sem chave) e da
rota de status; integração do `PUT /api/settings` (pares válidos/inválidos por
modelo, tom preservado); gates STANDARD com `pnpm test:ci` (módulo
compartilhado cliente/servidor). UI validada no navegador em `/configuracoes`,
aba Voz. Um smoke live pago e único (D10) confirma o formato; escuta real das vozes
Gemini é humana.

## Decisoes aprovaveis
- D1 (revisa D11–D12, aprovação do Igor): o TTS passa a ter provedor por
  modelo (`openai` | `openrouter`). STT continua só OpenAI/Whisper.
  `.agent/ARCHITECTURE.md` registra a revisão.
- D2: catálogo estático e curado em `lib/tts-options.ts`, não descoberta
  dinâmica. Verificado em 2026-10-16: `GET /api/v1/models` padrão não lista
  TTS; `GET /api/v1/models?output_modalities=speech` lista 35 modelos com
  `supported_voices`, mas `supported_parameters` vem vazio em todos (não indica
  suporte a instruções), vários têm 0 vozes e a qualidade em pt-BR varia.
  Descoberta exigiria rede ao abrir a aba, cache e validação dinâmica no PUT,
  sem entregar a capacidade de tom. Cadastrar modelo novo = uma entrada no
  catálogo com provedor, vozes, voz padrão e `supportsInstructions`.
- D3: cada entrada do catálogo tem `id`, `provider`, `label`,
  `supportsInstructions`, `voices` e `defaultVoice`. Gemini 3.8 Flash TTS entra
  com `supportsInstructions: false` (a página e a API não mostram campo de
  instruções) até prova contrária. `ttsModelSupportsInstructions` e
  `ttsVoiceSupportedBy` passam a consultar o catálogo; modelo fora do catálogo
  mantém a regra antiga (OpenAI, regex `tts-1*`).
- D4: novo cliente servidor `lib/openrouter-voice.ts` chama
  `POST https://openrouter.ai/api/v1/audio/speech` com `model`, `input`,
  `voice` e `response_format: "mp3"` (o padrão `pcm` exigiria conversão); nunca
  envia `instructions`. Chave via `resolveOpenRouterCredential()` (config antes
  de env, como o chat). Erro upstream vira 502 com mensagem genérica em pt-BR;
  o log leva só provedor, modelo e status.
- D5: `POST /api/voice/tts` resolve o modelo (corpo → `settings` → padrão) e
  roteia pelo provedor do catálogo. `instructions` do corpo segue validado
  (string ≤ 2000), mas é ignorado sem erro quando o modelo não aceita tom.
  Sem chave do provedor do modelo efetivo → 503 `tts_unavailable`.
- D6: `PUT /api/settings` valida `tts_model` contra o catálogo e `tts_voice`
  contra as vozes do modelo efetivo (corpo aplicado sobre o salvo); par
  inválido → 400. `tts_instructions` nunca é apagado por troca de modelo.
- D7 (contrato aditivo): `GET /api/voice/status` → `{ tts, sttServer,
  providers: { openai, openrouter } }`. `tts` = chave do provedor do modelo
  efetivo; `sttServer` = chave OpenAI. O `ChatPanel` não muda.
- D8: na UI, ao trocar de modelo, se a voz atual não existe no novo modelo a
  aba seleciona a `defaultVoice` dele e avisa (substitui o "escolher outra
  antes de salvar" da SPEC-005, por ser mais fácil entre provedores). Sem
  chave do provedor selecionado: aviso e "Ouvir amostra" desabilitado;
  "Salvar" continua permitido.

- D9 (respostas do Igor, 2026-10-16): `google/gemini-3.8-flash-lite-tts` fica
  fora desta spec. Voz padrão do Gemini: `Kore`, provisória. As 30 vozes ficam
  todas selecionáveis na aba Voz para comparação de ouvido; a escolha final é
  do Igor e não muda o código.
- D10 (autorizado pelo Igor em 2026-10-16): na tarefa 001, um único smoke live
  pago contra o OpenRouter (`ZETEL_E2E_LIVE=1`, `OPENROUTER_API_KEY` não
  vazia, `ZETEL_E2E_MAX_CALLS=1`), fora dos gates e da CI, para confirmar que
  `response_format: "mp3"` devolve `audio/mpeg` tocável. Frase curta fixa;
  nenhuma repetição sem nova autorização; resultado registrado só como status,
  content-type e tamanho em bytes.
