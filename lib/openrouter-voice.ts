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
