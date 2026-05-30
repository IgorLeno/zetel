import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { listMemoryTitles } from '@/lib/memory-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** GET /api/memory/titles — títulos das memórias (anti-duplicatas no prompt). */
export async function GET() {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ titles: [] });

  try {
    return NextResponse.json({ titles: listMemoryTitles(vaultPath) });
  } catch (err) {
    logger.error('memory titles read failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao listar títulos de memórias.' }, { status: 500 });
  }
}
