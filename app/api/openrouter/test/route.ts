import { NextResponse } from 'next/server';
import { getOpenRouterModel } from '@/lib/config';
import { pingChat, readApiKey } from '@/lib/openrouter';
import { getSetting } from '@/lib/settings';
import { resolveChatModel } from '@/lib/chat-prompt';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** POST /api/openrouter/test — valida chave com completion mínima. */
export async function POST() {
  try {
    const apiKey = readApiKey();
    const model = resolveChatModel(
      undefined,
      getSetting('default_model'),
      getOpenRouterModel(),
    );
    await pingChat(apiKey, model);
    logger.info('openrouter test ok', { model });
    return NextResponse.json({ ok: true, model });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes('não configurada')
        ? err.message
        : 'Não foi possível conectar ao OpenRouter. Verifique a chave e o modelo.';
    logger.warn('openrouter test failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
