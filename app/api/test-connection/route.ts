import { NextResponse } from 'next/server';
import { getOpenRouterKey } from '@/lib/config';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Testa a conexão com o OpenRouter usando GET /api/v1/key, que exige a chave e
 * retorna 401 quando ela é inválida — diferente de /models, que é um catálogo
 * público e responde 200 com qualquer chave (logo, não valida nada). Usar /key
 * é o que cumpre a intenção do botão: confirmar que a chave realmente funciona.
 * `fetch` puro — o SDK OpenRouter entra só no Módulo 5/6 (chat SSE).
 */
export async function GET() {
  const key = getOpenRouterKey();
  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'Nenhuma chave OpenRouter configurada. Salve a chave primeiro.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      logger.warn('openrouter test failed', { status: res.status });
      const detail =
        res.status === 401
          ? 'Chave OpenRouter inválida ou expirada.'
          : `O OpenRouter respondeu com erro (HTTP ${res.status}).`;
      return NextResponse.json({ ok: false, error: detail }, { status: 502 });
    }

    logger.info('openrouter test ok');
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('openrouter test error', { error: (err as Error).message });
    return NextResponse.json(
      { ok: false, error: 'Não foi possível alcançar o OpenRouter. Verifique sua conexão.' },
      { status: 502 },
    );
  }
}
