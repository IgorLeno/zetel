import { existsSync, readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { leituraHtmlPath } from '@/lib/render-service';
import { getZetelById } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/zetels/[id]/leitura — serve artefatos/leitura.html para o iframe. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json(
      { error: 'Leitura não construída. Use "Preparar leitura" na aba Leitura.' },
      { status: 404 },
    );
  }

  const zetel = getZetelById(getDb(), id);
  if (!zetel || zetel.trashedAt) {
    return NextResponse.json(
      { error: 'Leitura não construída. Use "Preparar leitura" na aba Leitura.' },
      { status: 404 },
    );
  }

  const path = leituraHtmlPath(vaultPath, zetel.slug);
  if (!existsSync(path)) {
    return NextResponse.json(
      { error: 'Leitura não construída. Use "Preparar leitura" na aba Leitura.' },
      { status: 404 },
    );
  }

  let html: string;
  try {
    html = readFileSync(path, 'utf8');
  } catch (err) {
    logger.error('leitura read failed', { zetelId: id, error: (err as Error).message });
    return NextResponse.json(
      { error: 'Falha ao ler a leitura. Reconstrua com "Atualizar leitura".' },
      { status: 500 },
    );
  }
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
