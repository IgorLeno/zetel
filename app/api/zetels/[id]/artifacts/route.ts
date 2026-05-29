import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { getArtifactsInfo } from '@/lib/render-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/zetels/[id]/artifacts — metadados dos artefatos sem ler o HTML. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    const info = getArtifactsInfo(getDb(), vaultPath, id);
    return NextResponse.json(info);
  } catch (err) {
    logger.error('zetel artifacts failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
