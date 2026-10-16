# Desvio aprovado: D4 `mp3` → `pcm` embrulhado em WAV (tarefa 001)

- Data: 2026-10-16. Aprovação: Igor Fernandes, no chat da sessão da tarefa 001
  ("aprovo, pode rodar e seguir com o fluxo").
- Evidência (smoke live D10, autorizado):
  1. `response_format: "mp3"` → 400 `application/json`, 97 bytes.
  2. Diagnóstico autorizado: upstream respondeu `Gemini TTS only supports
     response_format="pcm". Got "mp3".`
  3. Com `pcm` → WAV pelo código da tarefa: 200 `audio/wav`, 157484 bytes,
     24 kHz, 3,28 s.
- Decisão efetiva: `lib/openrouter-voice.ts` pede `pcm` e devolve WAV
  (cabeçalho de 44 bytes, 16-bit LE mono, taxa do `rate=` do content-type ou
  24 kHz). `/api/voice/tts` responde `audio/wav` para modelos `openrouter` e
  `audio/mpeg` para OpenAI. Sem streaming no caminho OpenRouter (o cabeçalho
  exige o tamanho total). Players do cliente usam o content-type do blob; UI e
  hooks não mudam.
- Critérios da tarefa 001 afetados: "`response_format: "mp3"`" e "responde
  `audio/mpeg`" valem só para OpenAI; para OpenRouter valem `pcm` e
  `audio/wav`. Demais critérios inalterados.
- Por que os artefatos aprovados não foram editados: `SPEC.md`, `PLAN.md` e
  `tasks/*.md` entram no digest; `agentctl spec approve --reapprove` recusa
  sobrescrever aprovação íntegra e o comando de revisão de spec ainda não
  existe. A próxima revisão da SPEC-013 deve incorporar esta decisão na D4.
- Total de chamadas pagas nesta tarefa: 3 (todas autorizadas).
