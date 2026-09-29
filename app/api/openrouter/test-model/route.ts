import { NextResponse } from 'next/server';
import { OpenRouterHttpError, pingChat } from '@/lib/openrouter';
import { resolveOpenRouterCredential } from '@/lib/config';
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
  const credential = resolveOpenRouterCredential();
  if (!credential.key) {
    return NextResponse.json({ ok: false, error: 'Chave OpenRouter não configurada.' }, { status: 400 });
  }

  try {
    await pingChat(credential.key, model);
    logger.info('openrouter test-model ok', { model });
    return NextResponse.json({ ok: true, model, source: credential.source });
  } catch (err) {
    const message = err instanceof OpenRouterHttpError
      ? err.message : 'Não foi possível conectar ao OpenRouter.';
    const kind = err instanceof OpenRouterHttpError ? err.kind : 'unknown';
    logger.warn('openrouter test-model failed', { model, kind });
    return NextResponse.json({ ok: false, kind, error: message }, { status: 400 });
  }
}
