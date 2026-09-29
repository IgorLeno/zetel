import { NextResponse } from 'next/server';
import { resolveOpenRouterCredential } from '@/lib/config';
import { OpenRouterHttpError, pingChat, type OpenRouterErrorKind } from '@/lib/openrouter';
import { effectiveChatModel, fetchOpenRouterKeyStatus } from '@/lib/openrouter-diagnostics';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const KEY_REJECTED = 'OpenRouter rejeitou a credencial (401).';
const KEY_LIMIT = 'Limite da chave OpenRouter atingido.';

/**
 * POST /api/openrouter/test — separa "chave válida" (/api/v1/key) de
 * "completion disponível" (1 token no modelo efetivo do chat). Sem retry e sem
 * trocar modelo/provedor: a falha é só reportada.
 */
export async function POST() {
  const credential = resolveOpenRouterCredential();
  if (!credential.key) {
    return NextResponse.json({ ok: false, error: 'Chave OpenRouter não configurada.' }, { status: 400 });
  }
  const model = effectiveChatModel();
  const key = await fetchOpenRouterKeyStatus(credential.key);
  const base = { model, source: credential.source, key };

  // Chave rejeitada ou limite esgotado: a completion falharia; não gasta a chamada.
  if (key.authenticated === false || key.blockedBy) {
    const kind: OpenRouterErrorKind = key.authenticated === false ? 'auth' : 'key-rate-limit';
    logger.warn('openrouter test failed', { model, kind });
    return NextResponse.json({
      ...base, ok: false, completion: { ok: false, kind, skipped: true },
      error: kind === 'auth' ? KEY_REJECTED : KEY_LIMIT,
    }, { status: 400 });
  }

  try {
    await pingChat(credential.key, model);
    logger.info('openrouter test ok', { model });
    return NextResponse.json({ ...base, ok: true, completion: { ok: true } });
  } catch (err) {
    const kind: OpenRouterErrorKind = err instanceof OpenRouterHttpError ? err.kind : 'unknown';
    const error = err instanceof OpenRouterHttpError
      ? err.message : 'Não foi possível conectar ao OpenRouter.';
    logger.warn('openrouter test failed', {
      model, kind, status: err instanceof OpenRouterHttpError ? err.status : 'network',
    });
    return NextResponse.json({ ...base, ok: false, completion: { ok: false, kind }, error }, { status: 400 });
  }
}
