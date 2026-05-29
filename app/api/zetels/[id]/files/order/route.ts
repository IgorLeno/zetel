import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { reorderFiles } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/zetels/[id]/files/order — reordena via { orderedIds }.
 * Segmento estático `order` tem precedência sobre o dinâmico `[fileId]` no Next.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;

  let body: { orderedIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (
    !Array.isArray(body.orderedIds) ||
    !body.orderedIds.every((x) => typeof x === 'string')
  ) {
    return NextResponse.json({ error: 'Lista de ordenação inválida.' }, { status: 400 });
  }

  try {
    reorderFiles(getDb(), id, body.orderedIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('zetel files reorder failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
