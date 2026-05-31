import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { artifactHtmlResponseHeaders } from '@/lib/artifact-html-headers';
import { resolveLeituraHtmlArtifact } from '@/lib/render-service';
import { resolveStudyGuideArtifact } from '@/lib/study-guide-service';
import { getZetelById } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/zetels/[id]/leitura — serve um artefato HTML para o iframe.
 *  - sem `artifact` ou `artifact=tecnico`: Documento Técnico (canônico → legado).
 *  - `artifact=guia-estudo`: Guia de Estudo.
 */
export async function GET(request: Request, { params }: Ctx) {
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

  const wantsGuide = new URL(request.url).searchParams.get('artifact') === 'guia-estudo';

  if (wantsGuide) {
    const guide = resolveStudyGuideArtifact(vaultPath, zetel.slug);
    if (!guide) {
      return NextResponse.json(
        { error: 'Guia de Estudo não gerado. Use "Preparar leitura → Guia de Estudo".' },
        { status: 404 },
      );
    }
    try {
      const guideHtml = await readFile(guide.path, 'utf8');
      return new NextResponse(guideHtml, { headers: artifactHtmlResponseHeaders() });
    } catch (err) {
      logger.error('guia read failed', { zetelId: id, error: (err as Error).message });
      return NextResponse.json(
        { error: 'Falha ao ler o Guia de Estudo. Gere-o novamente.' },
        { status: 500 },
      );
    }
  }

  const artifact = resolveLeituraHtmlArtifact(vaultPath, zetel.slug);
  if (!artifact) {
    return NextResponse.json(
      {
        error: 'Leitura técnica não construída. Use "Preparar leitura" na aba Leitura.',
      },
      { status: 404 },
    );
  }

  try {
    const html = await readFile(artifact.path, 'utf8');
    return new NextResponse(html, { headers: artifactHtmlResponseHeaders() });
  } catch (err) {
    logger.error('leitura read failed', { zetelId: id, error: (err as Error).message });
    return NextResponse.json(
      { error: 'Falha ao ler a leitura. Reconstrua com "Atualizar leitura".' },
      { status: 500 },
    );
  }
}
