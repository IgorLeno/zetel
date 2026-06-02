import { getVoiceKey } from './config';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_STT_URL = 'https://api.openai.com/v1/audio/transcriptions';

/** Env (dev/CI) → `~/.zetel/config` `openai_tts_key` (D30). */
export function readVoiceKey(): string {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = getVoiceKey();
  if (fromFile) return fromFile;
  throw new Error('Chave OpenAI não configurada. Defina OPENAI_API_KEY ou openai_tts_key em ~/.zetel/config.');
}

/** true se env ou config tiver chave configurada — sem lançar. */
export function hasVoiceKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || getVoiceKey());
}

export interface TranscribeParams {
  apiKey: string;
  file: File;
}

/** Encaminha o blob de áudio ao Whisper com language:'pt' (D37). Zero persistência (D38). */
export async function transcribeAudio({ apiKey, file }: TranscribeParams): Promise<{ text: string }> {
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch(OPENAI_STT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const data = (await res.json()) as { error?: { message?: unknown } };
      const msg = data?.error?.message;
      if (typeof msg === 'string' && msg.trim()) detail = msg.trim();
    } catch { /* body ausente ou não-JSON */ }
    throw new Error(detail ? `OpenAI STT: ${res.status} — ${detail}` : `OpenAI STT: ${res.status}`);
  }

  const data = (await res.json()) as { text?: string };
  if (typeof data.text !== 'string') throw new Error('OpenAI STT: resposta sem campo text');
  return { text: data.text };
}

export interface SynthesizeParams {
  apiKey: string;
  text: string;
  voice: string;
  model: string;
}

/**
 * Retorna a Response upstream para passthrough do ReadableStream (D32).
 * O chamador faz: new Response(upstream.body, { headers: { 'Content-Type': 'audio/mpeg' } })
 */
export async function synthesizeSpeech({ apiKey, text, voice, model }: SynthesizeParams): Promise<Response> {
  const res = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, voice, input: text }),
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const data = (await res.json()) as { error?: { message?: unknown } };
      const msg = data?.error?.message;
      if (typeof msg === 'string' && msg.trim()) detail = msg.trim();
    } catch { /* body ausente ou não-JSON */ }
    throw new Error(detail ? `OpenAI TTS: ${res.status} — ${detail}` : `OpenAI TTS: ${res.status}`);
  }

  return res;
}
