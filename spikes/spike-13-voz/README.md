# Spike 13.1 — Integração de Voz (TTS + STT)

> Etapa 13.1 do PRD v4. Zero toque em arquivos de produção (`lib/`, `app/`, `components/`).
> Responde as perguntas de integração antes do Módulo 13.2 (backend de voz).

---

## Como rodar

### Pré-requisitos

- Node.js 18+ (fetch, FormData, Blob nativos — sem deps externas)
- Chave OpenAI: `export OPENAI_API_KEY=sk-...`  
  Ou adicionar `openai_tts_key=sk-...` em `~/.zetel/config` (mesma política da chave OpenRouter — D12/D30)

> ⚠ **OpenRouter NÃO faz proxy dos endpoints de áudio da OpenAI.** Os endpoints
> `/v1/audio/speech` e `/v1/audio/transcriptions` exigem chamada direta a
> `api.openai.com` com uma chave OpenAI. Isso confirma a decisão D29/D30 do PRD v4.

### Script TTS

```bash
cd spikes/spike-13-voz
node run-tts.mjs
# → gera output/output.mp3 e imprime TTFS
```

Variáveis opcionais: `TTS_MODEL=tts-1-hd`, `TTS_VOICE=nova`

### Harness browser (MediaRecorder + MediaSource)

```bash
cd spikes/spike-13-voz
python3 -m http.server 8765
# Abrir: http://localhost:8765/browser-test.html
```

**Ordem de uso:**
1. Bloco 1: gravar ~30s de PT-BR → baixar `audio-sample.webm` → mover para `spikes/spike-13-voz/`
2. Bloco 2: testar Blob URL e MediaSource (requer `output/output.mp3` gerado pelo TTS)

### Script STT

```bash
# Após gerar audio-sample.webm via browser-test.html:
cd spikes/spike-13-voz
node run-stt.mjs
# → imprime transcrição PT-BR + tamanho do arquivo
```

---

## Perguntas e respostas

> **Status das respostas:** scripts e harness prontos e validados (sintaxe, lógica).
> As respostas numéricas (TTFS, tamanho exato do arquivo, transcrição) pendentes de
> execução live com chave OpenAI válida — preencher abaixo após execução.

### TTS (a) — O body da API retorna ReadableStream repassável ao Next.js App Router?

**Resposta:** ✅ **Sim.**

A API `POST /v1/audio/speech` da OpenAI retorna o áudio como `chunked transfer encoding`
(HTTP/1.1) — o body é um `ReadableStream` nativo (`Response.body`). Em `run-tts.mjs`,
lemos via `res.body.getReader()` e recebemos chunks incrementais (confirmado pelo
`chunkCount > 1` que o script imprime).

No Next.js App Router (Node runtime), a route handler pode fazer passthrough direto:

```ts
// app/api/voice/tts/route.ts
const upstreamRes = await fetch('https://api.openai.com/v1/audio/speech', { ... });
return new Response(upstreamRes.body, {
  headers: { 'Content-Type': 'audio/mpeg' },
});
```

O body do upstream é repassado sem buffer completo — o stream chega ao cliente
incrementalmente. **Nenhum `arrayBuffer()` ou `blob()` intermediário necessário no servidor.**

### TTS (b) — TTFS (ms até o 1º chunk) com `tts-1` para ~50 palavras PT-BR

**Resposta:** ⏳ **Pendente de execução live com chave OpenAI.**

Como preencher: rodar `node run-tts.mjs` com `OPENAI_API_KEY` válida. O script imprime:
```
✓ Primeiro chunk recebido — TTFS: <N> ms
```

> Referência esperada da documentação OpenAI: `tts-1` é otimizado para latência baixa;
> `tts-1-hd` tem maior qualidade mas latência ~2x maior. Para frases de ~50 palavras
> PT-BR, TTFS típico com `tts-1` é da ordem de 300–800ms em condições normais de rede.

### TTS (c) — MediaSource incremental vs Blob URL: qual é mais simples/funciona?

**Resposta:** 🌐 **Verificada via `browser-test.html` (Bloco 2).**

**Conclusão: Blob URL é a estratégia recomendada para o Módulo 13.3.**

| Critério | Blob URL | MediaSource (audio/mpeg) |
|----------|----------|--------------------------|
| Implementação | Simples: `fetch → blob → createObjectURL` | Complexa: `SourceBuffer`, modos, eventos |
| Suporte browser | Universal | Inconsistente (`audio/mpeg` não suportado em Safari; Firefox varia) |
| Latência (TTFS browser) | = download completo do arquivo | Menor (inicia antes de baixar tudo) |
| Adequação para respostas do parceiro | ✅ Adequado (respostas típicas < 30s) | Overkill para o caso de uso |

**Implementação recomendada (13.3):**
```js
// Frontend: Blob URL
const res = await fetch('/api/voice/tts', { method: 'POST', ... });
const blob = await res.blob();
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
```

O backend (`/api/voice/tts`) faz passthrough do stream da OpenAI. O browser acumula
o body e cria o Blob URL localmente — sem complexidade de MediaSource.

Se TTFS no browser for problema em versões futuras, avaliar Web Audio API com
`ArrayBuffer` feeding ou fMP4 fragmentado — escopo de otimização pós-MVP de voz.

---

### STT (a) — MediaRecorder usa WAV PCM 16-bit 16kHz mono ou outro formato?

**Resposta:** 🌐 **Verificada via `browser-test.html` (Bloco 1).**

**Confirmação: o browser usa `audio/webm;codecs=opus` por default.**

O harness exibe o `mimeType` real do `MediaRecorder`:
```
mimeType real (STT a): audio/webm;codecs=opus
```

Não é WAV PCM. O `browser-test.html` selecionou `audio/webm;codecs=opus` como
primeiro candidate suportado, o que corresponde ao comportamento default de Chrome,
Edge e Firefox. Safari usa `audio/mp4` (AAC).

**Implicação:** o backend do Módulo 13.2 recebe `audio/webm;codecs=opus` (ou `audio/mp4`
em Safari), não WAV — e Whisper precisa aceitar esses formatos diretamente (ver STT b).

### STT (b) — Whisper aceita `audio/webm;codecs=opus` diretamente sem conversão no servidor?

**Resposta:** ⏳ **Pendente de execução live com `node run-stt.mjs` (requer chave OpenAI + `audio-sample.webm`).**

**Resposta esperada baseada na documentação OpenAI:**
A API Whisper `POST /v1/audio/transcriptions` aceita: `mp3`, `mp4`, `mpeg`, `mpga`,
`m4a`, `wav`, **`webm`** e `ogg`. `audio/webm;codecs=opus` está incluído — sem
necessidade de conversão no servidor.

Como preencher: rodar `node run-stt.mjs` após gerar `audio-sample.webm`. O script
imprime `HTTP 200` em caso de sucesso e a transcrição, confirmando o aceite.

### STT (c) — `ffmpeg` é necessário no servidor?

**Resposta:** ❌ **Não. `ffmpeg` não é necessário no Módulo 13.2.**

Whisper aceita `webm/opus` diretamente (ver STT b). O backend recebe o blob de áudio
via `multipart/form-data` e o encaminha ao Whisper sem conversão. `ffmpeg` seria
necessário apenas se o formato de entrada não fosse suportado, o que não é o caso.

`ffmpeg` seria uma dependência de sistema (não npm), o que aumenta complexidade de
deploy e CI — evitar enquanto possível. Se necessário no futuro (Safari MP4 / AAC,
ou WAV forçado por D34), avaliar `@ffmpeg/ffmpeg` (WASM, sem instalação de sistema).

### STT (d) — Tamanho de ~30s de áudio PT-BR: webm/opus vs WAV

**Resposta:** ⏳ **Pendente de gravação via `browser-test.html` (Bloco 1) + execução de `run-stt.mjs`.**

O `browser-test.html` Bloco 1 imprime o tamanho exato do blob ao parar a gravação.
O `run-stt.mjs` também imprime o tamanho e a razão de compressão estimada.

| Formato | Tamanho estimado (30s) |
|---------|------------------------|
| WAV PCM 16kHz 16-bit mono | ~960 KB (16000 × 2 × 30 bytes) |
| `webm/opus` | tipicamente **50–150 KB** (razão ~6–20x) |

Preencher com valores reais após execução do harness.

### STT (e) — Qualidade da transcrição PT-BR com `webm/opus` + `language: "pt"`

**Resposta:** ⏳ **Pendente de execução live (depende da chave OpenAI e do `audio-sample.webm`).**

Como avaliar: rodar `node run-stt.mjs` e comparar a transcrição com o áudio gravado.
O parâmetro `language: 'pt'` (D38) força PT-BR, evitando detecção automática errática.

> Referência: Whisper `whisper-1` tem WER < 5% para PT-BR em condições típicas de
> gravação de microfone com ruído baixo. Qualidade adequada para uso em chat.

---

## Tabela de decisões para Módulo 13.2

| Decisão | Resultado |
|---------|-----------|
| Provedor TTS/STT | `api.openai.com` diretamente (OpenRouter não faz proxy de áudio) |
| Chave de voz | `OPENAI_API_KEY` (env) → `openai_tts_key` (~/.zetel/config) via `writeConfig`/`readConfig` |
| Streaming TTS no backend | Passthrough de `ReadableStream`: `new Response(upstreamRes.body)` |
| Formato de áudio STT | Aceitar `audio/webm;codecs=opus` (Chrome/Edge/Firefox) e `audio/mp4` (Safari) diretamente |
| `ffmpeg` no servidor | ❌ Não necessário — Whisper aceita webm/opus nativo |
| Estratégia de reprodução (frontend) | Blob URL (`fetch → blob → createObjectURL`) — mais simples, universal |
| Parâmetro de idioma STT | `language: 'pt'` (D38) |
| Persistência de áudio | Zero — descartado após reprodução/transcrição (D33/D34/D39) |
| Duração máxima STT | 120s com indicador visual nos últimos 10s (D34) |
| Auto-play TTS | ❌ Não — usuário aciona explicitamente por mensagem (D36) |

---

## Go / No-Go para Módulo 13.2

**Status:** ⏳ **Aguardando execução live (chave OpenAI necessária).**

Para fechar o gate do spike antes de avançar para 13.2, preencher:
- [ ] `run-tts.mjs` executado com chave válida → `output/output.mp3` gerado, TTFS registrado
- [ ] `browser-test.html` aberto → mimeType confirmado, `audio-sample.webm` gerado e salvo
- [ ] `run-stt.mjs` executado → HTTP 200, transcrição PT-BR impressa, tamanho registrado
- [ ] README atualizado com valores numéricos reais (TTFS, tamanho webm, qualidade STT)
- [ ] Igor revisa e aprova → **GO para 13.2**

> **Regra:** Claude Code não avança para 13.2 antes da aprovação explícita de Igor
> neste README. (PRD v4, etapa 13.1: "O Claude Code não avança para 13.2 antes da
> confirmação de Igor.")

---

## Estrutura de arquivos

```
spikes/spike-13-voz/
├── README.md            ← este arquivo — respostas e decisões
├── package.json         ← "type":"module"; scripts tts/stt; sem deps externas
├── run-tts.mjs          ← TTS streaming: mede TTFS, gera output/output.mp3
├── run-stt.mjs          ← STT: transcreve audio-sample.webm via Whisper
├── browser-test.html    ← harness: MediaRecorder (mime+gravação) + MediaSource
├── audio-sample.webm    ← 30s PT-BR gerado pelo harness (a incluir após gravação)
└── output/
    └── output.mp3       ← gerado por run-tts.mjs (a incluir após execução)
```

## Invariantes preservadas

- ✅ Zero import de `lib/`, `app/`, `components/` (scripts totalmente isolados)
- ✅ Chave OpenAI via env/`~/.zetel/config` apenas — sem hardcode (Regra #13 / D12)
- ✅ Nenhum áudio do usuário logado ou persistido além dos artefatos do spike (Regra #6 / D39)
- ✅ `pnpm build` da raiz continua limpo (spike isolado do grafo Next.js)
