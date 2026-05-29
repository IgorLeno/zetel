import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { restoreZetel } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/zetels/[id]/restore — restaura da lixeira. */
export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    restoreZetel(getDb(), vaultPath, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('zetel restore failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
