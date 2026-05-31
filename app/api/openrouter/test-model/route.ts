import { NextResponse } from 'next/server';
import { pingChat, readApiKey } from '@/lib/openrouter';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** POST /api/openrouter/test-model — valida chave com o modelo informado. */
export async function POST(request: Request) {
  let body: { model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 });
  }

  if (typeof body.model !== 'string' || !body.model.trim()) {
    return NextResponse.json({ ok: false, error: 'Modelo inválido.' }, { status: 400 });
  }

  const model = body.model.trim();

  try {
    const apiKey = readApiKey();
    await pingChat(apiKey, model);
    logger.info('openrouter test-model ok', { model });
    return NextResponse.json({ ok: true, model });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Não foi possível conectar ao OpenRouter. Verifique a chave e o modelo.';
    logger.warn('openrouter test-model failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
