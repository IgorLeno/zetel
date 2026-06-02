import { NextResponse } from 'next/server';
import { hasVoiceKey } from '@/lib/openai-voice';

export const runtime = 'nodejs';

/** GET /api/voice/status — indica se TTS/STT estão disponíveis (mesma chave serve ambos). */
export async function GET() {
  const available = hasVoiceKey();
  return NextResponse.json({ tts: available, stt: available });
}
