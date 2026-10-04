# SPEC-006-voice-sample-playback: Voz: amostra toca sem AbortError e para de forma limpa

Kind: `mini`

## Problema
Na aba Voz (SPEC-005), "Ouvir amostra" pode falhar com
`AbortError: The play() request was interrupted by a call to pause()` e
mostrar "Não foi possível tocar a amostra." (relato de Igor com `coral` +
"Descontraído"). Reproduzido no navegador com `fetch` falso (sem OpenAI): o
cleanup `useEffect(() => () => stopPreview(), [])` chama `pause()` com o
`play()` ainda pendente (desmontagem do painel, Fast Refresh/StrictMode em
dev), e o `catch` de `preview()` trata a parada intencional como falha.
Defeito irmão: parar/desmontar durante o `fetch` não aborta a requisição, e a
amostra começa a tocar depois de o usuário sair da aba.

## Resultado esperado
- Parada intencional (nova amostra, troca de aba, desmontagem) nunca vira
  mensagem de erro nem rejeição não tratada.
- Parar durante o `fetch` aborta a requisição; nenhum áudio é criado depois.
- Falha real de reprodução (blob inválido, autoplay bloqueado) continua
  mostrando "Não foi possível tocar a amostra."; erro HTTP continua com a
  mensagem da rota.
- A URL do blob é revogada em todo caminho (fim, parada, falha).

## Limites
- Fora: `hooks/useTtsQueue.ts`, barge-in, rota `/api/voice/tts`, settings,
  textos e layout da aba Voz.
- Sem dependências novas (sem jsdom/testing-library).
- Logs só IDs/contagens (regra 6); este fix não adiciona logs.

## Verificacao
Unit do controlador de amostra com `fetch`/`Audio` falsos (parada com `play()`
pendente, parada durante `fetch`, falha real, erro HTTP, revogação de URL);
`pnpm typecheck`; `git diff --check`; validação no navegador com `fetch`
falso (sem chamada paga). Escuta real só com autorização de Igor.

## Decisoes aprovaveis
- D1: extrair o ciclo da amostra para `lib/sample-player.ts` (puro, client-safe,
  dependências injetáveis) com `play()` retornando `played | stopped |
  http-error | play-error`; `VozPanel` só mapeia o resultado para feedback.
- D2: "parada intencional" é detectada por identidade da sessão (a sessão
  corrente foi substituída/parada), não pelo nome do erro; `AbortError` de uma
  sessão ainda corrente conta como falha real.
- D3: cada sessão usa `AbortController` próprio; `stop()` aborta o `fetch`,
  pausa o áudio e revoga a URL.
