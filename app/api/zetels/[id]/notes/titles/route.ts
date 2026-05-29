import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { listNoteTitles } from '@/lib/notes-service';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/zetels/[id]/notes/titles — títulos existentes (para evitar duplicatas). */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();

  let slug: string;
  try {
    slug = assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ titles: [] });

  return NextResponse.json({ titles: listNoteTitles(vaultPath, slug) });
}
