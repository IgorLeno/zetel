import { NextResponse } from 'next/server';
import { resolveOpenRouterCredential, writeConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** Estado seguro e atual para reabertura da página de Configurações. */
export async function GET() {
  const { configured, source } = resolveOpenRouterCredential();
  return NextResponse.json({ configured, source }, { headers: { 'Cache-Control': 'no-store' } });
}

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const updated: string[] = [];

  if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || !body.apiKey.trim())) {
    return NextResponse.json({ error: 'Chave OpenRouter inválida.' }, { status: 400 });
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model.trim())) {
    return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
  }

  try {
    if (typeof body.apiKey === 'string') {
      writeConfig('OPENROUTER_API_KEY', body.apiKey.trim());
      updated.push('apiKey');
    }
    if (typeof body.model === 'string') {
      writeConfig('OPENROUTER_MODEL', body.model.trim());
      updated.push('model');
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 500 });
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Nada a salvar.' }, { status: 400 });
  }

  let credential;
  try {
    credential = resolveOpenRouterCredential();
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar a configuração salva.' }, { status: 500 });
  }
  if (typeof body.apiKey === 'string' &&
      (credential.source !== 'config' || credential.key !== body.apiKey.trim())) {
    return NextResponse.json({ error: 'A chave não foi confirmada após salvar.' }, { status: 500 });
  }
  logger.info('config updated', { fields: updated.join(',') });
  return NextResponse.json({ ok: true, configured: credential.configured, source: credential.source });
}
