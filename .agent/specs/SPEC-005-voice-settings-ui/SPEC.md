# SPEC-005-voice-settings-ui: Voz: secao de configuracao de voz com selecao validada

Kind: `mini`

## Problema
Depois da SPEC-004, modelo, voz e tom da parceira só mudam editando
`settings` por API, sabendo os valores exatos. Igor testou a voz `marin` e
não gostou; quer experimentar outras vozes e tons pela tela de Configurações,
sem decorar identificadores e sem risco de salvar combinação inválida.

## Resultado esperado
Configurações ganha uma aba **Voz** com:
- Select de modelo: `gpt-4o-mini-tts` (padrão), `tts-1`, `tts-1-hd`.
- Select de voz com as 13 vozes da OpenAI (doc oficial consultada em
  2026-10-03): `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`,
  `onyx`, `sage`, `shimmer`, `verse`, `marin`, `cedar`. `ballad`, `verse`,
  `marin` e `cedar` só existem no `gpt-4o-mini-tts`; com `tts-1*` aparecem
  desabilitadas.
- Tom: presets "Calmo e próximo (padrão)", "Professor direto",
  "Descontraído", "Neutro" e "Personalizado" (textarea com contador
  `n/2000`). Com `tts-1*` o tom fica desabilitado com aviso de que o modelo
  ignora instruções.
- Botão "Ouvir amostra": sintetiza uma frase fixa em pt-BR com
  modelo/voz/tom selecionados, sem salvar.
- Botões "Salvar" e "Restaurar padrão" (apaga as três chaves e volta aos
  padrões do código).

## Limites
- Fora: alterar `DEFAULT_TTS_*` e o tom padrão; STT; `VOICE_STYLE_PROMPT`;
  velocidade/formato de áudio; outro provedor; listar vozes dinamicamente pela
  API (a OpenAI não expõe endpoint de vozes); UI da chave OpenAI (continua na
  configuração local).
- Sem migração: `settings` segue chave/valor. Valor salvo antigo fora da
  lista continua sendo lido pela rota TTS (não quebra quem já configurou);
  só gravações novas são validadas.
- Logs só IDs/contagens (regra 6): nunca texto da amostra, instrução ou chave.

## Verificacao
Unit das opções/compatibilidade e da rota TTS (instrução no corpo, modelo/voz
inválidos); integração do `PUT /api/settings` (rejeita fora da lista e par
incompatível; aceita válidos); gates STANDARD; validação da UI no navegador
em `http://localhost:3001/configuracoes`. Escuta real das vozes é humana.

## Decisoes aprovaveis
- D1 (muda contrato): `PUT /api/settings` passa a rejeitar com 400
  `tts_model` fora de `gpt-4o-mini-tts|tts-1|tts-1-hd` e `tts_voice` fora das
  13 vozes; também rejeita o par efetivo (após aplicar o corpo sobre o salvo)
  em que a voz não existe no modelo. Vazio continua apagando a chave.
- D2: `POST /api/voice/tts` aceita `instructions` opcional no corpo (string,
  ≤ 2000) com precedência corpo → `settings` → padrão, para a amostra sem
  salvar; `model`/`voice` do corpo passam pela mesma lista e compatibilidade
  (400 se inválidos).
- D3: lista de modelos, vozes, compatibilidade e presets ficam em módulo puro
  `lib/tts-options.ts` (seguro para o cliente); `lib/openai-voice.ts` continua
  exportando `DEFAULT_TTS_*` (re-export, imports atuais intactos).
- D4: salvar o tom igual ao padrão grava vazio (apaga a chave), para que
  ajustes futuros do padrão no código continuem valendo.
- D5: a aba Voz é um componente novo (`components/VozPanel.tsx`) que lê
  `GET /api/settings`; `ConfiguracoesForm` não muda.
