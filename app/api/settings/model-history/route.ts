import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { parseModelHistory } from '@/lib/model-history';

export const runtime = 'nodejs';

const VALID_KEYS = ['model_history', 'study_guide_model_history', 'tech_doc_model_history'] as const;
type HistoryKey = (typeof VALID_KEYS)[number];

function isHistoryKey(value: unknown): value is HistoryKey {
  return typeof value === 'string' && (VALID_KEYS as readonly string[]).includes(value);
}

/** DELETE /api/settings/model-history */
export async function DELETE(request: Request) {
  let body: { key?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (!isHistoryKey(body.key)) {
    return NextResponse.json({ error: 'Chave inválida.' }, { status: 400 });
  }

  if (typeof body.model !== 'string' || !body.model.trim()) {
    return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
  }

  const model = body.model.trim();
  const existing = parseModelHistory(getSetting(body.key));
  const updated = existing.filter((m) => m !== model);
  setSetting(body.key, JSON.stringify(updated));

  logger.info('model history entry removed', { key: body.key, count: updated.length });
  return NextResponse.json({ history: updated });
}
