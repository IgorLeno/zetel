import { NextResponse } from 'next/server';
import {
  DEFAULT_TTS_INSTRUCTIONS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  MAX_TTS_INSTRUCTIONS_CHARS,
  readVoiceKey,
  synthesizeSpeech,
} from '@/lib/openai-voice';
import { readOpenRouterVoiceKey, synthesizeSpeechOpenRouter } from '@/lib/openrouter-voice';
import { getSetting } from '@/lib/settings';
import {
  isTtsModel,
  isTtsVoice,
  ttsModelSupportsInstructions,
  ttsProviderOf,
  ttsVoiceSupportedBy,
  type TtsProvider,
} from '@/lib/tts-options';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 4096;

/** Chave do provedor do modelo efetivo, ou null sem lançar (SPEC-013 D5). */
function providerKey(provider: TtsProvider): string | null {
  if (provider === 'openrouter') return readOpenRouterVoiceKey();
  try {
    return readVoiceKey();
  } catch {
    return null;
  }
}

/** Status HTTP upstream: `status` do erro OpenRouter ou o prefixo `TTS: NNN` da OpenAI. */
function upstreamStatus(err: unknown): number | null {
  if (err instanceof Error) {
    const status = (err as Error & { status?: unknown }).status;
    if (typeof status === 'number') return status;
    const match = /TTS: (\d{3})/.exec(err.message);
    if (match) return Number(match[1]);
  }
  return null;
}

/** POST /api/voice/tts — MP3 da OpenAI em passthrough (D32); WAV do OpenRouter (SPEC-013 D5). */
export async function POST(request: Request) {
  let body: { text?: unknown; voice?: unknown; model?: unknown; instructions?: unknown };
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

  // Corpo → settings → padrão. Corpo validado (SPEC-005 D2): a amostra da aba
  // Voz testa combinações sem salvar. Settings legados não são revalidados aqui.
  const bodyVoice = typeof body.voice === 'string' ? body.voice.trim() : '';
  const bodyModel = typeof body.model === 'string' ? body.model.trim() : '';
  if (bodyModel && !isTtsModel(bodyModel)) {
    return NextResponse.json({ error: 'Modelo de voz desconhecido.' }, { status: 400 });
  }
  if (bodyVoice && !isTtsVoice(bodyVoice)) {
    return NextResponse.json({ error: 'Voz desconhecida.' }, { status: 400 });
  }
  if (body.instructions !== undefined && typeof body.instructions !== 'string') {
    return NextResponse.json({ error: 'instructions inválido.' }, { status: 400 });
  }
  const bodyInstructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
  if (bodyInstructions.length > MAX_TTS_INSTRUCTIONS_CHARS) {
    return NextResponse.json(
      { error: `instructions excede ${MAX_TTS_INSTRUCTIONS_CHARS} caracteres.` },
      { status: 400 },
    );
  }

  const voice = bodyVoice || getSetting('tts_voice') || DEFAULT_TTS_VOICE;
  const model = bodyModel || getSetting('tts_model') || DEFAULT_TTS_MODEL;
  if ((bodyVoice || bodyModel) && !ttsVoiceSupportedBy(model, voice)) {
    return NextResponse.json(
      { error: `A voz ${voice} não está disponível no modelo ${model}.` },
      { status: 400 },
    );
  }
  const provider = ttsProviderOf(model);
  // Tom ignorado sem erro em modelo que não o aceita; o salvo segue intacto (D5).
  const instructions = ttsModelSupportsInstructions(model)
    ? bodyInstructions || getSetting('tts_instructions') || DEFAULT_TTS_INSTRUCTIONS
    : undefined;

  const apiKey = providerKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: 'tts_unavailable' }, { status: 503 });
  }

  // Log só contagem, provedor e modelo — nunca texto, tom ou chave (D39 / Regra #6).
  logger.info('voice tts', { chars: text.length, provider, model });

  try {
    const upstream =
      provider === 'openrouter'
        ? await synthesizeSpeechOpenRouter({ apiKey, text, voice, model })
        : await synthesizeSpeech({ apiKey, text, voice, model, instructions });
    return new Response(upstream.body, {
      headers: {
        'Content-Type': provider === 'openrouter' ? 'audio/wav' : 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Nunca a mensagem: a da OpenAI carrega o corpo de erro upstream.
    const status = upstreamStatus(err);
    logger.error('voice tts failed', status === null ? { provider, model } : { provider, model, status });
    return NextResponse.json(
      { error: 'Não foi possível sintetizar áudio. Tente novamente.' },
      { status: 502 },
    );
  }
}
