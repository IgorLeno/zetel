import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { artifactHtmlResponseHeaders } from '@/lib/artifact-html-headers';
import { resolveStudyGuideArtifact } from '@/lib/study-guide-service';
import { getZetelById } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/zetels/[id]/guia-estudo — serve o HTML do Guia de Estudo.
 * Análoga a `/leitura`, dedicada ao guia (botão "Abrir Guia" da aba Artefatos).
 */
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
      { error: 'Guia de Estudo não gerado. Use "Gerar Guia de Estudo" na aba Leitura.' },
      { status: 404 },
    );
  }

  const guide = resolveStudyGuideArtifact(vaultPath, zetel.slug);
  if (!guide) {
    return NextResponse.json(
      { error: 'Guia de Estudo não gerado. Use "Gerar Guia de Estudo" na aba Leitura.' },
      { status: 404 },
    );
  }

  try {
    const html = await readFile(guide.path, 'utf8');
    return new NextResponse(html, { headers: artifactHtmlResponseHeaders() });
  } catch (err) {
    logger.error('guia read failed', { zetelId: id, error: (err as Error).message });
    return NextResponse.json(
      { error: 'Falha ao ler o Guia de Estudo. Gere-o novamente.' },
      { status: 500 },
    );
  }
}
