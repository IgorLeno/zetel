import { NextResponse } from 'next/server';
import { getOpenRouterModel, writeConfig } from '@/lib/config';
import { deleteSetting, getSetting, setSetting } from '@/lib/settings';
import {
  DEFAULT_STUDY_GUIDE_MAX_TOKENS,
  DEFAULT_STUDY_GUIDE_TIMEOUT_S,
  STUDY_GUIDE_MAX_TOKENS_MAX,
  STUDY_GUIDE_MAX_TOKENS_MIN,
  STUDY_GUIDE_TIMEOUT_S_MAX,
  STUDY_GUIDE_TIMEOUT_S_MIN,
} from '@/lib/study-guide-constants';
import { logger } from '@/lib/logger';
import { parseModelHistory, prependModelHistory } from '@/lib/model-history';

export const runtime = 'nodejs';

const DEFAULT_HISTORY_WINDOW = 10;

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

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
    study_guide_model: getSetting('study_guide_model'),
    tech_doc_model: getSetting('tech_doc_model'),
    chat_model: getSetting('chat_model'),
    note_model: getSetting('note_model'),
    memory_model: getSetting('memory_model'),
    chat_history_window: chatHistoryWindow,
    max_words_per_page: maxWords ? Number.parseInt(maxWords, 10) : null,
    study_guide_max_tokens: clampInt(
      getSetting('study_guide_max_tokens'),
      STUDY_GUIDE_MAX_TOKENS_MIN,
      STUDY_GUIDE_MAX_TOKENS_MAX,
      DEFAULT_STUDY_GUIDE_MAX_TOKENS,
    ),
    study_guide_timeout_s: clampInt(
      getSetting('study_guide_timeout_s'),
      STUDY_GUIDE_TIMEOUT_S_MIN,
      STUDY_GUIDE_TIMEOUT_S_MAX,
      DEFAULT_STUDY_GUIDE_TIMEOUT_S,
    ),
    model_history: parseModelHistory(getSetting('model_history')),
    study_guide_model_history: parseModelHistory(getSetting('study_guide_model_history')),
    tech_doc_model_history: parseModelHistory(getSetting('tech_doc_model_history')),
    chat_model_history: parseModelHistory(getSetting('chat_model_history')),
    note_model_history: parseModelHistory(getSetting('note_model_history')),
    memory_model_history: parseModelHistory(getSetting('memory_model_history')),
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
    study_guide_model?: unknown;
    tech_doc_model?: unknown;
    chat_model?: unknown;
    note_model?: unknown;
    memory_model?: unknown;
    chat_history_window?: unknown;
    max_words_per_page?: unknown;
    study_guide_max_tokens?: unknown;
    study_guide_timeout_s?: unknown;
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
    const history = prependModelHistory(parseModelHistory(getSetting('model_history')), model);
    setSetting('model_history', JSON.stringify(history));
    updated.push('default_model', 'model_history');
  }

  // Modelo dedicado do Guia de Estudo: vazio = limpar (volta ao modelo padrão).
  // NÃO espelha em ~/.zetel/config — só o default_model global faz isso.
  if (body.study_guide_model !== undefined) {
    if (typeof body.study_guide_model !== 'string') {
      return NextResponse.json({ error: 'Modelo do Guia de Estudo inválido.' }, { status: 400 });
    }
    const sgModel = body.study_guide_model.trim();
    if (sgModel) {
      setSetting('study_guide_model', sgModel);
      const sgHistory = prependModelHistory(
        parseModelHistory(getSetting('study_guide_model_history')),
        sgModel,
      );
      setSetting('study_guide_model_history', JSON.stringify(sgHistory));
      updated.push('study_guide_model', 'study_guide_model_history');
    } else {
      deleteSetting('study_guide_model');
      updated.push('study_guide_model');
    }
  }

  // Modelo dedicado do Documento Técnico: vazio = limpar (volta ao modelo padrão).
  if (body.tech_doc_model !== undefined) {
    if (typeof body.tech_doc_model !== 'string') {
      return NextResponse.json({ error: 'Modelo do Documento Técnico inválido.' }, { status: 400 });
    }
    const tdModel = body.tech_doc_model.trim();
    if (tdModel) {
      setSetting('tech_doc_model', tdModel);
      const tdHistory = prependModelHistory(
        parseModelHistory(getSetting('tech_doc_model_history')),
        tdModel,
      );
      setSetting('tech_doc_model_history', JSON.stringify(tdHistory));
      updated.push('tech_doc_model', 'tech_doc_model_history');
    } else {
      deleteSetting('tech_doc_model');
      updated.push('tech_doc_model');
    }
  }

  // Modelos por tarefa (D28): chat_model, note_model, memory_model.
  // Vazio = limpar (fallback ao modelo padrão global).
  for (const key of ['chat_model', 'note_model', 'memory_model'] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') {
        return NextResponse.json({ error: `${key} inválido.` }, { status: 400 });
      }
      const val = (body[key] as string).trim();
      const historyKey = `${key}_history`;
      if (val) {
        setSetting(key, val);
        const hist = prependModelHistory(parseModelHistory(getSetting(historyKey)), val);
        setSetting(historyKey, JSON.stringify(hist));
        updated.push(key, historyKey);
      } else {
        deleteSetting(key);
        updated.push(key);
      }
    }
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

  if (body.study_guide_max_tokens !== undefined) {
    const n =
      typeof body.study_guide_max_tokens === 'number'
        ? body.study_guide_max_tokens
        : Number.parseInt(String(body.study_guide_max_tokens), 10);
    if (
      !Number.isFinite(n) ||
      n < STUDY_GUIDE_MAX_TOKENS_MIN ||
      n > STUDY_GUIDE_MAX_TOKENS_MAX
    ) {
      return NextResponse.json(
        {
          error: `Máximo de tokens do guia deve ser entre ${STUDY_GUIDE_MAX_TOKENS_MIN} e ${STUDY_GUIDE_MAX_TOKENS_MAX}.`,
        },
        { status: 400 },
      );
    }
    setSetting('study_guide_max_tokens', String(Math.trunc(n)));
    updated.push('study_guide_max_tokens');
  }

  if (body.study_guide_timeout_s !== undefined) {
    const n =
      typeof body.study_guide_timeout_s === 'number'
        ? body.study_guide_timeout_s
        : Number.parseInt(String(body.study_guide_timeout_s), 10);
    if (!Number.isFinite(n) || n < STUDY_GUIDE_TIMEOUT_S_MIN || n > STUDY_GUIDE_TIMEOUT_S_MAX) {
      return NextResponse.json(
        {
          error: `Timeout do guia deve ser entre ${STUDY_GUIDE_TIMEOUT_S_MIN} e ${STUDY_GUIDE_TIMEOUT_S_MAX} segundos.`,
        },
        { status: 400 },
      );
    }
    setSetting('study_guide_timeout_s', String(Math.trunc(n)));
    updated.push('study_guide_timeout_s');
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Nada a salvar.' }, { status: 400 });
  }

  logger.info('settings updated', { keys: updated.join(',') });
  return NextResponse.json(readSettingsPayload());
}
