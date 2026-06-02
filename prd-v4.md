# PRD v4 — Módulo 13: Modo Conversa por Voz sobre o documento aberto

> Fonte autoritativa para tudo relacionado a voz no Zetel.
> Depende de: Gate 12 aprovado (2026-06-01). Pré-requisito de 13.2: spike 13.1 aprovado por Igor.

---

## Objetivo

Permitir que o usuário **converse por voz com o parceiro de estudos** enquanto lê um documento, recebendo respostas orais didáticas e contextuais — com qualidade conversacional (frases curtas, tom oral, contexto da página preservado).

TTS e STT são **mecanismos técnicos**. O produto percebido pelo usuário é: falar com o parceiro enquanto lê, receber resposta oral curta e contextual, e continuar a conversa naturalmente — não apenas ter parágrafos lidos em voz alta.

---

## Parte A — Modelo de controle de voz: dois toggles ortogonais

O `ChatPanel` expõe dois estados independentes que o usuário controla via um **chip compacto** no compositor, que abre um popover com dois seletores:

```
inputMode:  'text' | 'voice'    // como o usuário envia mensagens
outputMode: 'text' | 'audio'    // como o parceiro responde
```

Estado persistido em `localStorage` (`zetel_voice_prefs`). Degrada silenciosamente para `'text'`/`'text'` se a chave OpenAI sumir.

### As quatro combinações

| inputMode | outputMode | Comportamento | `interactionMode` | Auto‑TTS |
|-----------|-----------|--------------|-------------------|----------|
| text | text (A) | Chat textual puro | `'text'` | não |
| text | audio (B) | Digita → Enviar → TTS automático ao fim do SSE | `'voice'` | **sim** |
| voice | text (C) | 🎙 → STT → transcrição no chat → resposta texto | `'text'` | não |
| voice | audio (D) | 🎙 → STT → transcrição → SSE → TTS automático → idle | `'voice'` | **sim** |

**Invariante:** `interactionMode` e auto‑TTS dependem **somente de `outputMode`** (`audio` → `'voice'` + TTS; `text` → `'text'` + sem TTS). `inputMode` controla **apenas** se o microfone 🎙 aparece e se o envio é por STT.

O texto **sempre** aparece no chat — voz é camada de entrada e/ou saída, nunca substitui o registro textual (D40).

---

## Parte B — Decisão de arquitetura

### Estratégia escolhida: STT separado → rota de chat textual existente → TTS

```
[microfone PTT] → blob webm/opus
      ↓
POST /api/voice/stt  →  transcrição (texto PT-BR)
      ↓
POST /api/zetels/:id/chat  (interactionMode: 'voice')
      ↓  (streaming SSE idêntico ao chat textual)
GET /api/voice/tts  (texto resposta → MP3 stream)
      ↓
[Audio() com Blob URL no frontend]
```

### Por que NÃO usar `gpt-audio-mini` como base

| Critério | STT+chat+TTS (escolhido) | gpt-audio-mini nativo |
|----------|--------------------------|----------------------|
| Streaming SSE textual | Preservado integralmente | Requer reescrita |
| Pipeline de contexto | Reaproveitado | Reescrito do zero |
| Fallback textual | Perfeito (resposta já no chat) | Complexo |
| Mistura de modais | Nenhuma | Chat multimodal novo |
| Histórico canônico | Texto no SQLite (já funciona) | Áudio como dado primário |
| Scope M13 | Contido | Amplo demais |

`gpt-audio-mini` fica registrado como **pesquisa futura** ("modo voz nativo") — fora do escopo do Módulo 13.

---

## Parte C — Contrato `interactionMode`

### Body da requisição de chat

A rota `app/api/zetels/[id]/chat/route.ts` deve aceitar:

```ts
{
  userMessage: string;
  pageIndex?: number;
  model?: string;
  // NOVO em 13.2:
  interactionMode?: 'text' | 'voice';
}
```

O campo `interactionMode` é opcional. Valor padrão: `'text'`. Preserva retrocompatibilidade total.

### Instruções de estilo oral (quando `interactionMode = 'voice'`)

`buildOpenRouterMessages()` em `lib/chat-prompt.ts` recebe `interactionMode` e, quando `'voice'`, acrescenta ao system prompt do parceiro as seguintes instruções:

```
Você está em modo conversa por voz. Adapte seu estilo:
- Responda como conversa falada, não como artigo escrito.
- Use frases curtas e diretas.
- Evite tabelas, listas longas e Markdown estrutural.
- Explique em passos pequenos, um de cada vez.
- Quando fizer sentido, termine com uma pergunta curta para manter a conversa.
- Use o documento aberto como base, mas fale naturalmente.
- Não leia trechos longos do documento em voz alta.
```

### Contexto do documento preservado integralmente

O modo voz **não altera** o contrato de contexto existente. O body de chat continua enviando:
- `pageIndex` (sincronizado via `postMessage` do iframe)
- Contexto adicional do Guia de Estudo quando ativo: `readingMode`, `guideBlockId`, `guideSectionId`, `guideBlockTitle`, `guideBlockIndex`, `guideBlockTotal`

**O modo voz não reduz nem altera o contexto do documento.** Mesma payload do chat textual.

---

## Parte D — Decisões de voz (D29–D42)

| ID | Decisão |
|----|---------|
| D29 | Provedor TTS/STT: `api.openai.com` diretamente — OpenRouter não faz proxy de áudio. |
| D30 | Chave de voz: `OPENAI_API_KEY` (env) → `openai_tts_key` em `~/.zetel/config` via `readConfig`/`writeConfig`. Mesma política da chave OpenRouter (D12/D22). |
| D31 | TTS: modelo `tts-1` (baixa latência; `tts-1-hd` como opção configurável). Voz default: `nova`. |
| D32 | Streaming TTS no backend: passthrough de `ReadableStream` — `new Response(upstreamRes.body, { headers: { 'Content-Type': 'audio/mpeg' } })`. Sem buffer completo no servidor. |
| D33 | Reprodução no frontend: Blob URL (`fetch → blob → createObjectURL → new Audio(url)`). Mais simples e universal que MediaSource; adequado para respostas < 30s. Limpeza de `URL.createObjectURL` após reprodução. |
| D34 | STT: aceitar `audio/webm;codecs=opus` (Chrome/Edge/Firefox) e `audio/mp4` (Safari) diretamente — Whisper aceita esses formatos sem conversão. Duração máxima: 120s com indicador visual nos últimos 10s. |
| D35 | `ffmpeg` no servidor: não necessário — Whisper aceita webm/opus nativo. Avaliar `@ffmpeg/ffmpeg` (WASM) somente se Safari/MP4/AAC criar problema em 13.4. |
| D36 | Auto-play TTS: acionado automaticamente **apenas** quando `outputMode='audio'` (`interactionMode='voice'`). Combinações A e C (outputMode='text') nunca disparam TTS automático. |
| D37 | Parâmetro de idioma STT: `language: 'pt'` — evita detecção automática errática. |
| D38 | Persistência de áudio: zero — áudio descartado após reprodução/transcrição. |
| D39 | Sem log de áudio ou transcrição em `~/.zetel/logs/`. Somente IDs e contagens (Regra #6/DT4). |
| D40 | Transcrição do usuário: aparece como mensagem no chat (visível) antes ou imediatamente ao envio. É o registro canônico — áudio não é fonte de verdade. |
| D41 | Fallback textual obrigatório: se TTS falhar, a resposta textual já está no chat — zero perda de conteúdo para o usuário. |
| D42 | Sem duas reproduções simultâneas: nova reprodução interrompe a anterior. |

---

## Parte E — Estrutura de etapas do Módulo 13

### 13.1 — Spike técnico + critérios conversacionais *(em andamento)*

Localização: `spikes/spike-13-voz/`

Questões técnicas respondidas pelo spike:
- TTS(a): ReadableStream passável ao Next.js App Router ✅
- TTS(b): TTFS com `tts-1` para ~50 palavras PT-BR ⏳ (pendente execução live)
- TTS(c): Blob URL vs MediaSource → **Blob URL recomendado** ✅
- STT(a): MediaRecorder usa `audio/webm;codecs=opus` por default ✅
- STT(b): Whisper aceita webm/opus diretamente ⏳ (pendente execução live)
- STT(c): `ffmpeg` necessário? **Não** ✅
- STT(d): Tamanho de 30s webm/opus ⏳ (pendente execução live)
- STT(e): Qualidade de transcrição PT-BR ⏳ (pendente execução live)

Gate 13.1 → 13.2: spike 13.1 aprovado por Igor (inclui critérios de qualidade conversacional).

### 13.2 — Backend de voz

Entregáveis:
- `app/api/voice/stt/route.ts` — recebe `multipart/form-data` com blob webm/opus; encaminha ao Whisper com `language: 'pt'`; retorna `{ text: string }`.
- `app/api/voice/tts/route.ts` — recebe `{ text: string, voice?: string }`; retorna stream MP3 via passthrough `ReadableStream` da OpenAI.
- `app/api/zetels/[id]/chat/route.ts` — aceita `interactionMode?: 'text' | 'voice'`.
- `lib/chat-prompt.ts` (`buildOpenRouterMessages`) — recebe e usa `interactionMode`; injeta instruções de estilo oral quando `'voice'`.
- Settings: `tts_voice` (default `nova`), `tts_model` (default `tts-1`), `openai_tts_key` (leitura via `readConfig`).

Sem SQL novo. Sem alteração de contrato SSE. Fallback textual implícito (resposta já no chat).

### 13.3 — UI de voz

Entregáveis no `ChatPanel`:
- Microfone PTT no rodapé (ícone mic; clique inicia gravação, clique novamente para; hold-to-talk).
- Estados visuais: **ouvindo** (gravando) / **transcrevendo** (STT em curso) / **pensando** (SSE em curso) / **falando** (TTS em reprodução).
- Transcrição do usuário aparece no campo de input (e no chat) antes ou imediatamente ao envio.
- TTS automático da resposta acionado apenas quando modo conversa está ativo.
- Indicador visual de duração (últimos 10s dos 120s máximos de STT).

### 13.4 — Polimento *(concluído)*

Entregáveis:
- **Chip de modo de voz** no compositor: `inputMode × outputMode` com popover flutuante (seletores Entrada: Texto|Voz / Saída: Texto|Áudio). Substitui o modelo implícito por dois toggles ortogonais explícitos.
- **Remoção do botão ▶ por mensagem** — sem "Ouvir resposta" avulso; TTS da resposta é sempre escopado por `outputMode`.
- **Persistência** em `localStorage` (`zetel_voice_prefs`); degradação silenciosa se a chave sumir.
- **Gating por `/api/voice/status`**: chip oculto quando ambos `false`; "Voz"/"Áudio" desabilitados com tooltip quando a chave correspondente está ausente.
- **Botão ⏹** no rodapé durante reprodução (cobre combinação B — Texto→Áudio, onde não há mic visível).
- Interrupção de áudio ao iniciar nova gravação (`stopCurrentAudio` no início de `startRecording`).
- Limpeza de `URL.createObjectURL` após reprodução/erro (D33). Sem duas reproduções simultâneas (D42).
- TTS falha → retorna a `idle` silenciosamente — texto já visível no chat (D41).
- Teste manual com documento real — qualidade conversacional avaliada por Igor.

---

## Parte F — Critérios de qualidade conversacional

O gate não é apenas técnico. Para Igor aprovar 13.2, os seguintes critérios devem ser confirmados:

1. **Brevidade oral** — resposta falada é mais curta que resposta textual equivalente; o parceiro fala frases, não lê parágrafos.
2. **Markdown ausente no modo voz** — com `interactionMode = 'voice'`, o parceiro não gera tabelas, listas aninhadas ou headers.
3. **Contexto preservado** — `pageIndex`, `readingMode`, `guideBlockId`, `guideSectionId`, `guideBlockTitle`, `guideBlockIndex`, `guideBlockTotal` são enviados integralmente — mesma payload do chat textual.
4. **Transcrição visível** — a transcrição do usuário aparece no chat antes ou imediatamente ao envio.
5. **TTS automático escopado** — TTS da resposta é automático **apenas** quando `outputMode='audio'`; combinações A e C (saída texto) não disparam TTS.
6. **Fallback textual garantido** — se TTS falhar, a resposta textual já está no chat; zero perda de conteúdo.
7. **Texto como registro canônico** — transcrição e resposta textual são os dados gravados em `chat_messages`; áudio descartado após uso.

---

## Parte G — Fontes de verdade

| Arquivo | Papel |
|---------|-------|
| `prd-v4.md` (este arquivo) | Fonte autoritativa do Módulo 13 (voz) — decisões D29–D42, contrato `interactionMode`, etapas 13.1–13.4 |
| `spikes/spike-13-voz/README.md` | Resultados do spike 13.1 (perguntas técnicas, tabela de decisões, Go/No-Go) |
| `prd-v3.md` | PRD v3 — fonte autoritativa dos Módulos 9–12 e decisões D16–D28 |

Regra: divergência entre `CLAUDE.md` e este PRD → **PRD vence**.

---

## Parte H — Gate e sequência

```
Spike 13.1 (estruturalmente completo)
    Pendente: execução live com OPENAI_API_KEY
              valores numéricos no README
              aprovação de Igor (critérios técnicos + conversacionais)
         ↓
Módulo 13.2 — Backend de voz
         ↓
Módulo 13.3 — UI de voz
         ↓
Módulo 13.4 — Polimento
         ↓
Gate 13 → PRD v5 (prompts editáveis + modo internet)
```

Nenhuma etapa começa antes do gate da anterior ser aprovado por Igor.
