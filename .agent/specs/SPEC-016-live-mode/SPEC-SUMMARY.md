# SPEC-016-live-mode Summary

Titulo: Modo Live: conversa por voz em tempo real com Gemini Live
Kind: full
Status: PENDING_APPROVAL

Botão Live no chat abre conversa por voz em tempo real com `gemini-3.8-live`
via token efêmero criado no servidor (chave Gemini só no servidor, em
`~/.zetel/config`). Contexto travado no token: parceira + página atual do
banco + memória global. Até 15 min por sessão, interrupção nativa,
transcrição salva por turno em `chat_messages` (`meta.live`). Sem ferramentas
(SPEC-014/015). Whisper + TTS continuam fora do Live. Quatro tarefas: 001
chave/voz/status, 002 token + contexto, 003 cliente Live + smoke único, 004
persistência dos turnos.
