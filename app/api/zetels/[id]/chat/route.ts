import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  clearHistory,
  getPageByIndex,
  listMessages,
  listRecentMessages,
  saveMessage,
} from '@/lib/chat-service';
import {
  buildOpenRouterMessages,
  resolveChatModel,
  resolveHistoryWindow,
} from '@/lib/chat-prompt';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { readApiKey, streamChat } from '@/lib/openrouter';
import { getOpenRouterModel } from '@/lib/config';
import { getSetting } from '@/lib/settings';
import { getZetelById } from '@/lib/zetel-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const KEY_ERROR =
  'Chave OpenRouter não configurada. Defina OPENROUTER_API_KEY em ~/.zetel/config.';

function friendlyKeyError(err: unknown): string | null {
  if (err instanceof Error && err.message.includes('não configurada')) {
    return KEY_ERROR;
  }
  return null;
}

/** GET /api/zetels/[id]/chat */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ messages: listMessages(db, id) });
}

/** DELETE /api/zetels/[id]/chat */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }
  clearHistory(db, id);
  return NextResponse.json({ ok: true });
}

/** POST /api/zetels/[id]/chat — SSE da resposta do assistente */
export async function POST(request: Request, { params }: Ctx) {
  const { id: zetelId } = await params;
  const db = getDb();

  try {
    assertZetelAtivo(db, zetelId);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  let body: { userMessage?: unknown; pageIndex?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const userMessage =
    typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
  if (!userMessage || userMessage.length > 4000) {
    return NextResponse.json(
      { error: 'Mensagem inválida (vazia ou acima de 4000 caracteres).' },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = readApiKey();
  } catch (err) {
    const friendly = friendlyKeyError(err);
    return NextResponse.json(
      { error: friendly ?? KEY_ERROR },
      { status: 400 },
    );
  }

  const zetel = getZetelById(db, zetelId);
  if (!zetel) {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  let pageIndex: number | null = null;
  if (body.pageIndex !== undefined && body.pageIndex !== null) {
    const n =
      typeof body.pageIndex === 'number'
        ? body.pageIndex
        : Number.parseInt(String(body.pageIndex), 10);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Índice de página inválido.' }, { status: 400 });
    }
    pageIndex = n;
  }

  let pageContent: string | null = null;
  if (pageIndex !== null) {
    const page = getPageByIndex(db, zetelId, pageIndex);
    if (!page) {
      return NextResponse.json(
        {
          error:
            'Página não encontrada. Processe os arquivos e prepare a leitura antes de conversar.',
        },
        { status: 400 },
      );
    }
    pageContent = page.contentText;
  }

  const model = resolveChatModel(
    typeof body.model === 'string' ? body.model : undefined,
    getSetting('default_model'),
    getOpenRouterModel(),
  );

  const historyWindow = resolveHistoryWindow(getSetting('chat_history_window'));
  const history = listRecentMessages(db, zetelId, historyWindow);

  const openRouterMessages = buildOpenRouterMessages({
    displayName: zetel.displayName,
    pageContent,
    history,
    userMessage,
  });

  saveMessage(db, {
    zetelId,
    role: 'user',
    content: userMessage,
    pageIndex,
    model,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';
      try {
        for await (const chunk of streamChat({
          apiKey,
          model,
          messages: openRouterMessages,
        })) {
          fullContent += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }

        saveMessage(db, {
          zetelId,
          role: 'assistant',
          content: fullContent,
          pageIndex,
          model,
        });
        controller.close();
      } catch (err) {
        logger.error('chat stream failed', {
          zetelId,
          model,
          error: err instanceof Error ? err.message : 'unknown',
        });
        const msg =
          err instanceof Error && err.message.startsWith('OpenRouter:')
            ? 'O OpenRouter recusou a requisição. Verifique o modelo e a chave.'
            : 'Não foi possível obter resposta do parceiro. Tente novamente.';
        controller.enqueue(encoder.encode(`data: [ERROR] ${msg}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
