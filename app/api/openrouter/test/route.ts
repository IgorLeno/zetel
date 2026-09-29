import { NextResponse } from 'next/server';
import { getOpenRouterModel, resolveOpenRouterCredential } from '@/lib/config';
import { OpenRouterHttpError, pingChat } from '@/lib/openrouter';
import { getSetting } from '@/lib/settings';
import { resolveChatModel } from '@/lib/chat-prompt';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** POST /api/openrouter/test — valida chave com completion mínima. */
export async function POST() {
  const credential = resolveOpenRouterCredential();
  if (!credential.key) {
    return NextResponse.json({ ok: false, error: 'Chave OpenRouter não configurada.' }, { status: 400 });
  }
  const model = resolveChatModel(
    undefined,
    getSetting('chat_model') || getSetting('default_model'),
    getOpenRouterModel(),
  );
  try {
    await pingChat(credential.key, model);
    logger.info('openrouter test ok', { model });
    return NextResponse.json({ ok: true, model, source: credential.source });
  } catch (err) {
    const message = err instanceof OpenRouterHttpError
      ? err.message : 'Não foi possível conectar ao OpenRouter.';
    logger.warn('openrouter test failed', { model });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
