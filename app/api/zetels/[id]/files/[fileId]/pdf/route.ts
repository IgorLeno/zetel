import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { resolvePdfFile } from '@/lib/focus';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; fileId: string }> };

const NOT_FOUND = 'PDF não encontrado neste Zetel.';

/**
 * GET /api/zetels/[id]/files/[fileId]/pdf — serve o PDF original para o leitor
 * (SPEC-001 D1/D2). Só arquivo registrado no Zetel; nenhum caminho vem do
 * cliente. ID alheio, inexistente ou não-PDF recebem o mesmo 404.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id, fileId } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  const file = resolvePdfFile(getDb(), vaultPath, id, fileId);
  if (!file) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(file.path);
  } catch (err) {
    // Regra #6: o erro de fs traz o caminho — só o código vai ao log.
    logger.warn('pdf serve read failed', {
      fileId: file.fileId,
      code: (err as NodeJS.ErrnoException).code ?? 'unknown',
    });
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  logger.info('pdf served', { zetelId: id, fileId: file.fileId, bytes: data.length });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(data.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // Aberto direto no navegador, o PDF não ganha a origem do app.
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
