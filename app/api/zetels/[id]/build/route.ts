import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { renderZetel } from '@/lib/render-service';
import { generateStudyGuide } from '@/lib/study-guide-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/** OpenRouter + render podem levar ~1 min; Next.js usa segundos. */
export const maxDuration = 60;

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/zetels/[id]/build — gera um artefato de leitura.
 *  - sem `mode` ou `mode=tecnico`: Documento Técnico (determinístico, sem LLM).
 *  - `mode=guia-estudo`: Guia de Estudo (pipeline editorial com LLM, D26).
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  const mode = new URL(request.url).searchParams.get('mode');

  try {
    if (mode === 'guia-estudo') {
      const result = await generateStudyGuide(getDb(), vaultPath, id);
      return NextResponse.json({ result });
    }
    const result = await renderZetel(getDb(), vaultPath, id);
    return NextResponse.json({ result });
  } catch (err) {
    logger.error('zetel build failed', { id, mode: mode ?? 'tecnico', error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
