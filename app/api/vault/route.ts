import { NextResponse } from 'next/server';
import { initVaultStructure, validateVaultPath } from '@/lib/vault';
import { setSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'; // better-sqlite3 + fs não rodam no Edge

export async function POST(request: Request) {
  let body: { path?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (typeof body.path !== 'string') {
    return NextResponse.json({ error: 'Caminho do vault ausente ou inválido.' }, { status: 400 });
  }

  const validation = validateVaultPath(body.path);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    initVaultStructure(validation.path);
    setSetting('vault_path', validation.path);
    logger.info('vault path saved');
    return NextResponse.json({ ok: true, path: validation.path });
  } catch (err) {
    logger.error('vault save failed', { error: (err as Error).message });
    return NextResponse.json(
      { error: 'Falha ao inicializar o vault. Verifique as permissões do diretório.' },
      { status: 500 },
    );
  }
}
