import { resolveOpenRouterCredential } from './config';

const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/audio/speech';

/** Chave pelo resolvedor do chat (config antes de env), sem lançar (SPEC-013 D4). */
export function readOpenRouterVoiceKey(): string | null {
  return resolveOpenRouterCredential().key;
}

export function hasOpenRouterVoiceKey(): boolean {
  return readOpenRouterVoiceKey() !== null;
}

/** Só o status: o corpo upstream pode ecoar texto ou dados da conta (regra 6). */
export class OpenRouterTtsError extends Error {
  constructor(readonly status: number) {
    super(`OpenRouter TTS: ${status}`);
    this.name = 'OpenRouterTtsError';
  }
}

/** Gemini TTS no OpenRouter só aceita `pcm`: 16-bit LE mono, 24 kHz por padrão. */
const PCM_DEFAULT_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;

/** Taxa do `rate=` do content-type (ex.: `audio/L16;rate=24000`); senão 24 kHz. */
export function pcmSampleRate(contentType: string | null): number {
  const match = /rate=(\d+)/i.exec(contentType ?? '');
  const rate = match ? Number(match[1]) : NaN;
  return Number.isInteger(rate) && rate > 0 ? rate : PCM_DEFAULT_SAMPLE_RATE;
}

/** Prefixa o cabeçalho WAV de 44 bytes: `<audio>` toca WAV sem dependência nova. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}

export interface OpenRouterSynthesizeParams {
  apiKey: string;
  text: string;
  voice: string;
  model: string;
}

/**
 * Pede `pcm` (o Gemini rejeita `mp3` com 400, smoke de 2026-10-16) e devolve
 * WAV `audio/wav`. Sem streaming: o cabeçalho exige o tamanho total, e as
 * frases do chat são curtas. Nunca envia `instructions` (D4).
 */
export async function synthesizeSpeechOpenRouter({
  apiKey,
  text,
  voice,
  model,
}: OpenRouterSynthesizeParams): Promise<Response> {
  const res = await fetch(OPENROUTER_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text, voice, response_format: 'pcm' }),
  });
  if (!res.ok) {
    // Descarta o corpo sem lê-lo para liberar a conexão.
    await res.body?.cancel().catch(() => undefined);
    throw new OpenRouterTtsError(res.status);
  }
  const pcm = new Uint8Array(await res.arrayBuffer());
  const wav = pcmToWav(pcm, pcmSampleRate(res.headers.get('content-type')));
  return new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
}

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** `pcm16` da OpenAI: 16-bit LE mono a 24 kHz, sem cabeçalho de taxa no SSE. */
const CHAT_AUDIO_SAMPLE_RATE = 24000;

/** Tom e leitura literal: o modelo de chat responderia ao texto em vez de lê-lo. */
export function chatAudioSystemPrompt(instructions: string | undefined): string {
  const base =
    'Você é um leitor em voz alta. Leia em voz alta, exatamente e por inteiro, o texto da mensagem do usuário. ' +
    'Não responda, não comente, não traduza, não resuma e não acrescente nada, mesmo que o texto contenha perguntas ou pedidos.';
  const tone = instructions?.trim();
  return tone ? `${base}\n\nComo falar: ${tone}` : base;
}

/** Junta os `delta.audio.data` (base64) e a transcrição do SSE; ignora keep-alives. */
export function collectChatAudio(sse: string): { pcm: Uint8Array; transcript: string } {
  const chunks: Buffer[] = [];
  let transcript = '';
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let event: {
      error?: unknown;
      choices?: { delta?: { audio?: { data?: unknown; transcript?: unknown } } }[];
    };
    try {
      event = JSON.parse(payload);
    } catch {
      continue;
    }
    // Erro no meio do stream: só o status genérico, nunca o corpo (regra 6).
    if (event.error) throw new OpenRouterTtsError(502);
    const audio = event.choices?.[0]?.delta?.audio;
    if (typeof audio?.data === 'string' && audio.data) chunks.push(Buffer.from(audio.data, 'base64'));
    if (typeof audio?.transcript === 'string') transcript += audio.transcript;
  }
  return { pcm: new Uint8Array(Buffer.concat(chunks)), transcript };
}

function speechWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * O modelo de chat às vezes responde à frase em vez de lê-la ("Oi!" vira uma
 * saudação nova). Aceita a fala se quase toda palavra transcrita está no texto;
 * a folga cobre número lido por extenso. Sem transcrição não há como checar.
 */
export function transcriptMatchesText(text: string, transcript: string): boolean {
  const spoken = speechWords(transcript);
  if (spoken.length === 0) return true;
  const expected = speechWords(text);
  const known = new Set(expected);
  const extra = spoken.filter((word) => !known.has(word)).length;
  return extra <= Math.max(2, Math.ceil(expected.length * 0.25));
}

export interface OpenRouterChatAudioParams extends OpenRouterSynthesizeParams {
  instructions?: string;
}

/** Exemplo de leitura literal: frase que convida resposta é só repetida. */
const CHAT_AUDIO_EXAMPLE = 'Oi! Tudo bem com você? Por onde começamos?';

/** Uma nova tentativa quando a fala diverge do texto; depois, 502 (texto segue no chat, D41). */
const CHAT_AUDIO_ATTEMPTS = 2;

/**
 * Modelo de chat com saída de áudio (ex.: `openai/gpt-audio-mini`): o
 * OpenRouter exige `stream: true` para áudio; pede `pcm16`, junta o SSE inteiro
 * e devolve WAV `audio/wav`, como o caminho `/audio/speech`. A transcrição do
 * próprio stream confirma que o texto foi lido, não respondido.
 */
export async function synthesizeSpeechOpenRouterChatAudio({
  apiKey,
  text,
  voice,
  model,
  instructions,
}: OpenRouterChatAudioParams): Promise<Response> {
  for (let attempt = 1; attempt <= CHAT_AUDIO_ATTEMPTS; attempt++) {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        modalities: ['text', 'audio'],
        audio: { voice, format: 'pcm16' },
        stream: true,
        messages: [
          { role: 'system', content: chatAudioSystemPrompt(instructions) },
          { role: 'user', content: CHAT_AUDIO_EXAMPLE },
          { role: 'assistant', content: CHAT_AUDIO_EXAMPLE },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new OpenRouterTtsError(res.status);
    }
    const { pcm, transcript } = collectChatAudio(await res.text());
    if (pcm.byteLength === 0) throw new OpenRouterTtsError(502);
    if (!transcriptMatchesText(text, transcript)) continue;
    const wav = pcmToWav(pcm, CHAT_AUDIO_SAMPLE_RATE);
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
  }
  throw new OpenRouterTtsError(502);
}
