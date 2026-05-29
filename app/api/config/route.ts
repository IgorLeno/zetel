import { NextResponse } from 'next/server';
import { writeConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Salva chave OpenRouter e/ou modelo em `~/.zetel/config` (600).
 * A chave NUNCA é devolvida na resposta nem logada (regras #6 e #13).
 */
export async function POST(request: Request) {
  let body: { apiKey?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const updated: string[] = [];

  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
      return NextResponse.json({ error: 'Chave OpenRouter inválida.' }, { status: 400 });
    }
    writeConfig('OPENROUTER_API_KEY', body.apiKey.trim());
    updated.push('apiKey');
  }

  if (body.model !== undefined) {
    if (typeof body.model !== 'string' || !body.model.trim()) {
      return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
    }
    writeConfig('OPENROUTER_MODEL', body.model.trim());
    updated.push('model');
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Nada a salvar.' }, { status: 400 });
  }

  logger.info('config updated', { fields: updated.join(',') });
  return NextResponse.json({ ok: true });
}
