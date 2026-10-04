# SPEC-006-voice-sample-playback Summary

Titulo: Voz: amostra toca sem AbortError e para de forma limpa
Kind: mini
Status: PENDING_APPROVAL

Corrige "Ouvir amostra" da aba Voz: parada intencional com `play()` pendente
deixava de ser erro; parar durante o `fetch` passa a abortar a requisição.
Ciclo extraído para `lib/sample-player.ts` com testes unitários.
