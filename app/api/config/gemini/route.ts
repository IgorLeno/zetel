import { NextResponse } from 'next/server';
import { resolveGeminiCredential, writeConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Estado seguro da chave Gemini do modo Live (SPEC-016 D7). */
export async function GET() {
  const { configured, source } = resolveGeminiCredential();
  return NextResponse.json({ configured, source }, { headers: NO_STORE });
}

/**
 * Salva a chave Gemini em `~/.zetel/config` (600). A chave NUNCA é devolvida
 * na resposta nem logada (regras 6 e 9).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const apiKey = (body as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return NextResponse.json({ error: 'Chave Gemini inválida.' }, { status: 400 });
  }
  const key = apiKey.trim();
  // Chaves do AI Studio não têm espaço, controle nem `=`; recusar antes de
  // gravar evita injeção de linhas em `~/.zetel/config`.
  if (/[\s=\x00-\x1f\x7f]/.test(key)) {
    return NextResponse.json({ error: 'Chave Gemini inválida.' }, { status: 400 });
  }

  try {
    writeConfig('GEMINI_API_KEY', key);
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a configuração.' }, { status: 500 });
  }

  let credential;
  try {
    credential = resolveGeminiCredential();
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar a configuração salva.' }, { status: 500 });
  }
  if (credential.source !== 'config' || credential.key !== key) {
    return NextResponse.json({ error: 'A chave não foi confirmada após salvar.' }, { status: 500 });
  }
  logger.info('config updated', { fields: 'geminiApiKey' });
  return NextResponse.json(
    { ok: true, configured: credential.configured, source: credential.source },
    { headers: NO_STORE },
  );
}
