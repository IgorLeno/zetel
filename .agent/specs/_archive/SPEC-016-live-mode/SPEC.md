# SPEC-016-live-mode: Modo Live: conversa por voz em tempo real com Gemini Live

Kind: `full`

## Problema
A voz atual do Zetel é um ciclo STT (Whisper) → chat (OpenRouter) → TTS por
frase. Funciona, mas não tem a naturalidade, a latência e a interrupção de um
produto de voz moderno (PRODUCT_VISION §12, PRD v5 R9/R12). Igor considera o
modo Live a base do programa ("ChatGPT Live + persistência"): conversar por voz
em tempo real com a parceira sobre o material aberto, com a transcrição salva
como registro canônico. Hoje não existe chave Gemini, token efêmero, cliente
de áudio em tempo real nem caminho para persistir turnos vindos de voz ao vivo.

## Resultado esperado
- No chat de um Zetel, um botão **Live** inicia uma sessão de voz em tempo
  real com o Gemini Live (`gemini-3.8-live`), com a parceira já conhecendo a
  página atual do material, seu perfil e a memória global.
- Igor fala e interrompe livremente; a parceira responde em áudio com a voz
  escolhida (`live_voice`). Um indicador mostra estado (conectando, ouvindo,
  falando, encerrando) e o tempo restante.
- Cada turno concluído (Igor e parceira) aparece no chat e é salvo na sessão
  de estudo corrente, como qualquer mensagem, marcado como Live.
- A sessão termina ao clicar **Encerrar**, ao atingir 15 minutos ou por erro;
  depois disso o chat volta ao modo normal (Whisper + TTS), que não muda.
- A chave Gemini (AI Studio) é configurada em `/configuracoes`; a chave longa
  nunca sai do servidor. Sem chave, o botão Live fica desabilitado com aviso.

## Requisitos funcionais
- RF1 Chave: `GEMINI_API_KEY` em `~/.zetel/config` (prioridade) com env
  `GEMINI_API_KEY` como fallback. `/configuracoes` tem campo mascarado para
  salvar a chave e mostra só `configured`/`source`, como a OpenRouter.
- RF2 Voz: setting `live_voice`, validado contra as 30 vozes Gemini do
  catálogo de `lib/tts-options.ts`; padrão `Kore`. Escolhido em
  `/configuracoes`, junto da chave Gemini (não na aba Voz da SPEC-013).
- RF3 Status: `GET /api/voice/status` ganha `live: boolean` (chave Gemini
  presente), aditivo.
- RF4 Token: `POST /api/zetels/[id]/live/token` com `{ sessionId, pageIndex }`
  devolve `{ token, model, voice, expiresAt, maxSeconds, pageIndex }`. O
  servidor monta a system instruction (prompt da parceira + perfil da sessão +
  `zetel_pages.content_text` da página pedida + memória global lida no
  momento) e a trava no token via `liveConnectConstraints`.
- RF5 Cliente: captura do microfone em PCM 16-bit 16 kHz mono, reprodução de
  PCM 24 kHz, interrupção (barge-in) nativa do Live: ao chegar
  `serverContent.interrupted`, a reprodução para na hora.
- RF6 Duração: limite de 15 min por sessão Live (aviso aos 13 min, encerra aos
  15). Reconexão transparente com `sessionResumption` quando chega `GoAway`
  (conexões duram ~10 min), usando o mesmo token dentro de `expireTime`.
- RF7 Transcrição: `inputAudioTranscription` e `outputAudioTranscription`
  ligados. Cada turno concluído vira uma `chat_messages` da sessão de estudo
  via `POST /api/zetels/[id]/live/turns`, com `meta.live = true`; turno da
  parceira cortado por interrupção ou encerramento leva `meta.interrupted =
  true`.
- RF8 Troca de página: o contexto é fixo na sessão Live. Se Igor mudar de
  página, o indicador avisa e oferece "Reiniciar Live na página N" (novo
  token); nada reinicia sozinho.
- RF9 Sem ferramentas: nenhuma function calling, Google Search, nota, memória
  ou conceito é criado pelo Live nesta spec.

## Requisitos nao funcionais
- Segurança: chave longa só no servidor; o navegador recebe apenas o token
  efêmero (`uses: 1`, `newSessionExpireTime` 1 min, `expireTime` 16 min). O
  token vale só para a config travada (modelo, voz, modalidade, transcrição,
  system instruction); o cliente não consegue trocar a instrução.
- Regra 3: o conteúdo da página vem de `zetel_pages.content_text` no servidor;
  o cliente só envia `pageIndex`.
- Regra 6: logs só com IDs, contagens, duração e status HTTP (`zetelId`,
  `sessionId`, `pageIndex`, `chars`, `seconds`, `status`); nunca transcrição,
  página, memória, instrução, token ou chave.
- Regra 9: chave Gemini fora de SQLite, vault e Git.
- Custo: tier pago do AI Studio (conteúdo não usado para treino). Estimativa
  por sessão de 15 min com fala equilibrada: ~US$ 0,21 de áudio
  (0,005/min entrada + 0,018/min saída, preços de 2026-10-17) mais tokens de
  contexto; o teto de 15 min limita o gasto por sessão.
- Testes nunca chamam a rede; E2E live só nas condições da regra de E2E.

## Arquitetura
- `lib/config.ts`: `resolveGeminiCredential()` no mesmo formato de
  `resolveOpenRouterCredential()`.
- `app/api/config/route.ts` (ou rota irmã `app/api/config/gemini`): salva a
  chave Gemini; resposta sem a chave.
- `lib/live-options.ts`: modelo `gemini-3.8-live`, limites (15 min, aviso 13),
  vozes reaproveitadas do catálogo Gemini de `lib/tts-options.ts`.
- `lib/gemini-live-token.ts` (servidor): `POST
  https://generativelanguage.googleapis.com/v1beta/auth_tokens` com
  `x-goog-api-key`, `uses: 1`, `expireTime`, `newSessionExpireTime` e
  `liveConnectConstraints { model, config }`. Timeout e erro genérico.
- `lib/live-context.ts` (servidor): monta a system instruction reutilizando
  `ensureParceiroPrompt`, perfil da sessão, `truncatePageContext` e
  `buildMemoryContext` de `lib/chat-prompt.ts`.
- `app/api/zetels/[id]/live/token/route.ts` e
  `app/api/zetels/[id]/live/turns/route.ts`.
- Cliente: `hooks/useLiveSession.ts` (WebSocket, estados, resumption, timer),
  worklet de captura 16 kHz e player 24 kHz, `components/LiveButton` +
  indicador no `ChatPanel`. Conexão pelo SDK oficial `@google/genai`
  (`ai.live.connect`) com o token como `apiKey`, versão fixada.
- Persistência: reusa o insert de `lib/chat-service.ts`; `model =
  "gemini-3.8-live"`, `page_index` da sessão Live. Sem migração.

## Alternativas rejeitadas
- Proxy WebSocket no servidor Next (chave fica no servidor, áudio passa por
  ele): mais latência e um servidor WS que o Next não oferece nativamente; o
  token efêmero com config travada resolve o risco da chave.
- Chave longa no navegador: viola a regra 9 e o modelo de segurança.
- Substituir Whisper + TTS por Live em toda conversa por voz: Igor escolheu
  modo separado; o pipeline atual continua como fallback sem chave Gemini.
- Persistir a transcrição só no fim: perde a conversa se a aba fechar.
- Material inteiro no contexto: mais caro por sessão; Igor escolheu página +
  memória.
- Compressão de contexto para passar de 15 min: Igor escolheu 15 min fixos.
- WebSocket cru sem SDK: menos uma dependência, mas reimplementa protocolo,
  autenticação por token e resumption; o SDK oficial reduz risco de protocolo.

## Riscos
- Protocolo/modelo do Live em evolução (nomes e campos mudam): versão do SDK
  fixada, constantes num único módulo, testes de contrato com mocks; smoke
  autorizado confirma o caminho real.
- Transcrição do Live é aproximada: o texto salvo é o que o Live transcreveu,
  não um STT próprio; registrado como `meta.live` para distinguir.
- Conteúdo da transcrição vem do cliente: é inevitável (o servidor não vê o
  áudio). Mitigação: valida sessão/zetel, `role`, tamanho e quantidade; nunca
  é usado como fonte de página (regra 3 continua valendo para páginas).
- Memória lida só ao criar o token (adaptação da regra 5 ao Live): memória
  salva durante a sessão só entra numa nova sessão Live. Registrado em D5.
- Microfone/eco: usa `echoCancellation`/`noiseSuppression` do navegador; sem
  fone, interrupções falsas são possíveis (validação humana).
- Custo: teto de 15 min por sessão e nenhuma sessão abre sozinha.

## Estrategia de testes
- Unit: resolvedor da chave Gemini; validação de `live_voice`; montagem do
  corpo do token (constraints, expirações, sem chave no retorno); montagem da
  system instruction (página do banco, memória, perfil; ignora texto do
  cliente); rota de token (404 zetel/sessão, 400 página inválida, 503 sem
  chave, 502 upstream, logs sem conteúdo); rota de turnos (validação, insert,
  `meta.live`/`interrupted`); máquina de estados do hook com WebSocket/SDK
  simulado (connect, interrupted, GoAway → resumption, 15 min, erro).
- Integração: `PUT /api/settings` com `live_voice`; turnos persistidos
  aparecem no histórico da sessão.
- Gates por tarefa (ver TASKS.md); `pnpm test:ci`, `pnpm typecheck`,
  `git diff --check`; FULL acrescenta `pnpm build` e `pnpm test:coverage`.
- Live real: um único smoke autorizado (D9); escuta, interrupção e qualidade
  pt-BR são validação humana no navegador.

## Rollout e rollback
- Entrega por tarefa em `main`, com o botão Live visível só quando `live` for
  verdadeiro no status (sem chave = recurso invisível na prática).
- Observabilidade: logs de token criado/falho e turnos salvos, só IDs e
  contagens.
- Rollback: remover a chave Gemini desliga o Live; reverter commits não exige
  migração (sem schema novo). Mensagens Live salvas continuam válidas como
  `chat_messages` comuns.

## Decisoes aprovaveis
- D1 (Igor, 2026-10-17): V1 = conversa por voz + transcrição salva. Ferramentas
  (definição, formulário, busca, imagem) ficam para SPEC-014/015 e devem ser
  compartilhadas entre texto e Live.
- D2 (Igor, 2026-10-17): Live é modo separado, ligado por botão. Whisper +
  TTS continuam como estão fora da sessão Live; D11–D12 revistas pela SPEC-013
  não mudam.
- D3: modelo `gemini-3.8-live` (padrão da doc para agentes de voz de baixa
  latência, verificado em 2026-10-17), saída só `AUDIO`, transcrição de entrada
  e saída ligadas. Trocar de modelo = mudar a constante em `lib/live-options.ts`.
- D4: token efêmero criado no servidor (`v1beta/auth_tokens`), `uses: 1`,
  `newSessionExpireTime` +1 min, `expireTime` +16 min,
  `liveConnectConstraints` com modelo, voz, modalidade, transcrição,
  `sessionResumption` e system instruction. A chave longa nunca vai ao
  navegador; o token não é logado.
- D5 (Igor, 2026-10-17): contexto = prompt e perfil da parceira + página atual
  (`zetel_pages.content_text`, truncada como no chat) + memória global lida ao
  criar o token. Adaptação da regra 5: no Live a memória é lida a cada sessão
  (não a cada turno), porque a instrução fica travada no token. Troca de página
  oferece reinício, nunca automático.
- D6 (Igor, 2026-10-17): limite de 15 min por sessão, sem compressão de
  contexto; aviso aos 13 min; reconexão por `sessionResumption` no `GoAway`;
  tier pago do AI Studio.
- D7 (Igor, 2026-10-17): chave `GEMINI_API_KEY` em `~/.zetel/config`, env
  `GEMINI_API_KEY` como fallback, campo mascarado em `/configuracoes`. Altera
  `lib/config.ts` (tarefa FULL).
- D8 (Igor, 2026-10-17): transcrição salva por turno concluído em
  `chat_messages` da sessão de estudo corrente, `model = "gemini-3.8-live"`,
  `meta.live = true`, `meta.interrupted = true` quando cortado. Sem migração.
  Turnos Live não passam pelos extratores de nota/memória/conceito.
- D9 (autorizado pelo Igor em 2026-10-17): na tarefa 003, um único smoke live
  pago (`ZETEL_E2E_LIVE=1`, `GEMINI_API_KEY` não vazia,
  `ZETEL_E2E_MAX_CALLS=1`), fora dos gates e da CI: cria um token e abre uma
  sessão curta com uma frase fixa. Registra só status, contagens de eventos e
  bytes de áudio. Repetição exige nova autorização.
- D10 (Igor, 2026-10-17): setting `live_voice` próprio, validado contra as 30
  vozes Gemini, padrão `Kore`, escolhido em `/configuracoes` junto da chave
  Gemini; independente de `tts_voice`.
- D11: cliente usa o SDK oficial `@google/genai` com versão exata fixada
  (nova dependência de runtime no navegador), em vez de WebSocket cru.
