import { NextResponse } from 'next/server';
import { getOpenRouterModel, writeConfig } from '@/lib/config';
import { getSetting, setSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const DEFAULT_HISTORY_WINDOW = 10;

function readSettingsPayload() {
  const defaultModel =
    getSetting('default_model') ?? getOpenRouterModel();
  const rawWindow = getSetting('chat_history_window');
  const chatHistoryWindow = rawWindow
    ? Math.min(50, Math.max(1, Number.parseInt(rawWindow, 10) || DEFAULT_HISTORY_WINDOW))
    : DEFAULT_HISTORY_WINDOW;
  const maxWords = getSetting('max_words_per_page');

  return {
    default_model: defaultModel,
    chat_history_window: chatHistoryWindow,
    max_words_per_page: maxWords ? Number.parseInt(maxWords, 10) : null,
  };
}

/** GET /api/settings */
export async function GET() {
  return NextResponse.json(readSettingsPayload());
}

/** PUT /api/settings — campos parciais */
export async function PUT(request: Request) {
  let body: {
    default_model?: unknown;
    chat_history_window?: unknown;
    max_words_per_page?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const updated: string[] = [];

  if (body.default_model !== undefined) {
    if (typeof body.default_model !== 'string' || !body.default_model.trim()) {
      return NextResponse.json({ error: 'Modelo padrão inválido.' }, { status: 400 });
    }
    const model = body.default_model.trim();
    setSetting('default_model', model);
    writeConfig('OPENROUTER_MODEL', model);
    updated.push('default_model');
  }

  if (body.chat_history_window !== undefined) {
    const n =
      typeof body.chat_history_window === 'number'
        ? body.chat_history_window
        : Number.parseInt(String(body.chat_history_window), 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return NextResponse.json(
        { error: 'Janela de histórico deve ser um número entre 1 e 50.' },
        { status: 400 },
      );
    }
    setSetting('chat_history_window', String(n));
    updated.push('chat_history_window');
  }

  if (body.max_words_per_page !== undefined) {
    const n =
      typeof body.max_words_per_page === 'number'
        ? body.max_words_per_page
        : Number.parseInt(String(body.max_words_per_page), 10);
    if (!Number.isFinite(n) || n < 100) {
      return NextResponse.json(
        { error: 'Palavras por página deve ser um número ≥ 100.' },
        { status: 400 },
      );
    }
    setSetting('max_words_per_page', String(n));
    updated.push('max_words_per_page');
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Nada a salvar.' }, { status: 400 });
  }

  logger.info('settings updated', { keys: updated.join(',') });
  return NextResponse.json(readSettingsPayload());
}
