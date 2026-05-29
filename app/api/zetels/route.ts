import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { createZetel, listZetels } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'; // better-sqlite3 + fs não rodam no Edge

const NO_VAULT = 'Configure o caminho do vault em Configurações antes de criar Zetels.';

/** GET /api/zetels — lista ativos; ?trash=true lista somente os trasheados. */
export async function GET(request: Request) {
  try {
    const includeTrash = new URL(request.url).searchParams.get('trash') === 'true';
    const zetels = listZetels(getDb(), { includeTrash });
    return NextResponse.json({ zetels });
  } catch (err) {
    logger.error('zetels list failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao listar os Zetels.' }, { status: 500 });
  }
}

/** POST /api/zetels — cria um Zetel a partir de { displayName }. */
export async function POST(request: Request) {
  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
    return NextResponse.json({ error: 'Informe um nome para o Zetel.' }, { status: 400 });
  }

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    const zetel = createZetel(getDb(), vaultPath, body.displayName);
    return NextResponse.json({ zetel }, { status: 201 });
  } catch (err) {
    logger.error('zetel create failed', { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
