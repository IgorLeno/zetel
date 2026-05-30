import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
import { listMemoryTitles } from '@/lib/memory-service';

export const runtime = 'nodejs';

/** GET /api/memory/titles — títulos das memórias (anti-duplicatas no prompt). */
export async function GET() {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ titles: [] });
  return NextResponse.json({ titles: listMemoryTitles(vaultPath) });
}
