import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { removeFile } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/** DELETE /api/zetels/[id]/files/[fileId] — remove arquivo do disco e do DB. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, fileId } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    removeFile(getDb(), vaultPath, id, fileId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('zetel file remove failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
