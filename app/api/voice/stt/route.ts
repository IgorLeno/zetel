import { NextResponse } from 'next/server';
import { hasVoiceKey, readVoiceKey, transcribeAudio } from '@/lib/openai-voice';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** POST /api/voice/stt — transcreve áudio webm/opus ou mp4 via Whisper. Zero persistência (D38). */
export async function POST(request: Request) {
  if (!hasVoiceKey()) {
    return NextResponse.json({ error: 'stt_unavailable' }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const file = formData.get('audio');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Campo "audio" ausente ou inválido.' }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Áudio excede o limite de 25 MB.' }, { status: 400 });
  }

  // Log só bytes — nunca o conteúdo de áudio ou a transcrição (D39 / Regra #6).
  logger.info('voice stt', { bytes: file.size });

  let apiKey: string;
  try {
    apiKey = readVoiceKey();
  } catch {
    return NextResponse.json({ error: 'stt_unavailable' }, { status: 503 });
  }

  try {
    const { text } = await transcribeAudio({ apiKey, file });
    return NextResponse.json({ text });
  } catch (err) {
    logger.error('voice stt failed', { error: err instanceof Error ? err.message : 'unknown' });
    return NextResponse.json(
      { error: 'Não foi possível transcrever o áudio. Tente novamente.' },
      { status: 502 },
    );
  }
}
