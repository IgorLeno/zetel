import { NextResponse } from 'next/server';
import { hasVoiceKey } from '@/lib/openai-voice';

export const runtime = 'nodejs';

/**
 * GET /api/voice/status — TTS e STT de servidor dependem da chave OpenAI.
 * O microfone Web Speech é do navegador e não entra nesta resposta.
 */
export async function GET() {
  const available = hasVoiceKey();
  return NextResponse.json({ tts: available, sttServer: available });
}
