import { NextResponse } from 'next/server';
import {
  DEFAULT_TTS_INSTRUCTIONS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  hasVoiceKey,
  readVoiceKey,
  synthesizeSpeech,
} from '@/lib/openai-voice';
import { getSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 4096;

/** POST /api/voice/tts — passthrough do stream MP3 da OpenAI (D32). */
export async function POST(request: Request) {
  if (!hasVoiceKey()) {
    return NextResponse.json({ error: 'tts_unavailable' }, { status: 503 });
  }

  let body: { text?: unknown; voice?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text não pode ser vazio.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `text excede ${MAX_TEXT_CHARS} caracteres.` },
      { status: 400 },
    );
  }

  const voice =
    (typeof body.voice === 'string' && body.voice.trim()) ||
    getSetting('tts_voice') ||
    DEFAULT_TTS_VOICE;
  const model =
    (typeof body.model === 'string' && body.model.trim()) ||
    getSetting('tts_model') ||
    DEFAULT_TTS_MODEL;
  const instructions = getSetting('tts_instructions') || DEFAULT_TTS_INSTRUCTIONS;

  // Log só contagem de chars — nunca o texto (D39 / Regra #6).
  logger.info('voice tts', { chars: text.length });

  let apiKey: string;
  try {
    apiKey = readVoiceKey();
  } catch {
    return NextResponse.json({ error: 'tts_unavailable' }, { status: 503 });
  }

  try {
    const upstream = await synthesizeSpeech({ apiKey, text, voice, model, instructions });
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error('voice tts failed', { error: err instanceof Error ? err.message : 'unknown' });
    return NextResponse.json(
      { error: 'Não foi possível sintetizar áudio. Tente novamente.' },
      { status: 502 },
    );
  }
}
