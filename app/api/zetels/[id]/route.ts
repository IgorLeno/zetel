import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { purgeZetel, renameZetel, trashZetel } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/zetels/[id] — renomeia (altera só display_name). */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;

  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
    return NextResponse.json({ error: 'Informe um nome para o Zetel.' }, { status: 400 });
  }

  try {
    const zetel = renameZetel(getDb(), id, body.displayName);
    return NextResponse.json({ zetel });
  } catch (err) {
    logger.error('zetel rename failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/**
 * DELETE /api/zetels/[id]      → move para a lixeira.
 * DELETE /api/zetels/[id]?purge=true → exclui definitivamente.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const purge = new URL(request.url).searchParams.get('purge') === 'true';

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    if (purge) {
      purgeZetel(getDb(), vaultPath, id);
    } else {
      trashZetel(getDb(), vaultPath, id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error(purge ? 'zetel purge failed' : 'zetel trash failed', {
      id,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
