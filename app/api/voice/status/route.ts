import { NextResponse } from 'next/server';
import { hasVoiceKey } from '@/lib/openai-voice';
import { hasOpenRouterVoiceKey } from '@/lib/openrouter-voice';
import { getSetting } from '@/lib/settings';
import { DEFAULT_TTS_MODEL, ttsProviderOf } from '@/lib/tts-options';

export const runtime = 'nodejs';

/**
 * GET /api/voice/status — `tts` segue o provedor do modelo efetivo; o STT de
 * servidor continua Whisper/OpenAI (SPEC-013 D7, contrato aditivo).
 * O microfone Web Speech é do navegador e não entra nesta resposta.
 */
export async function GET() {
  const providers = { openai: hasVoiceKey(), openrouter: hasOpenRouterVoiceKey() };
  const model = getSetting('tts_model') || DEFAULT_TTS_MODEL;
  return NextResponse.json({
    tts: providers[ttsProviderOf(model)],
    sttServer: providers.openai,
    providers,
  });
}
