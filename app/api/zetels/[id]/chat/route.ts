import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  clearHistory,
  getPageByIndex,
  listMessages,
  listRecentMessages,
  saveMessage,
  updateMessageMeta,
} from '@/lib/chat-service';
import {
  buildOpenRouterMessages,
  extractNoteSuggestion,
  NOTE_MARK_START,
  resolveChatModel,
  resolveHistoryWindow,
} from '@/lib/chat-prompt';
import { ensureSugestaoNotaPrompt, listNoteTitles } from '@/lib/notes-service';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { readApiKey, streamChat, type UsageSink } from '@/lib/openrouter';
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

/** PATCH /api/zetels/[id]/chat — registra rejeição de sugestão de nota (só flag). */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  let body: { messageId?: unknown; rejected?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!messageId) {
    return NextResponse.json({ error: 'messageId ausente.' }, { status: 400 });
  }
  if (body.rejected === true) {
    updateMessageMeta(db, messageId, { noteRejected: true });
  }
  return NextResponse.json({ ok: true });
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
  let pageAnchor: string | null = null;
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
    pageAnchor = page.anchor;
  }

  const model = resolveChatModel(
    typeof body.model === 'string' ? body.model : undefined,
    getSetting('default_model'),
    getOpenRouterModel(),
  );

  const historyWindow = resolveHistoryWindow(getSetting('chat_history_window'));
  const history = listRecentMessages(db, zetelId, historyWindow);

  // Rubrica de sugestão de nota + títulos existentes (Módulo 6). Sem vault, segue
  // como chat simples (degrada sem quebrar).
  const vaultPath = getSetting('vault_path');
  let noteRubric: string | undefined;
  let existingTitles: string[] | undefined;
  if (vaultPath) {
    try {
      noteRubric = ensureSugestaoNotaPrompt(vaultPath);
      existingTitles = listNoteTitles(vaultPath, zetel.slug);
    } catch (err) {
      logger.error('note rubric load failed', { zetelId, error: (err as Error).message });
    }
  }

  const openRouterMessages = buildOpenRouterMessages({
    displayName: zetel.displayName,
    pageContent,
    history,
    userMessage,
    noteRubric,
    existingTitles,
  });

  // Cliente não envia conteúdo de página (D8); a fonte é sempre `zetel_pages`,
  // então o hash sempre confere quando há página.
  const pageHashMatch = pageIndex !== null ? true : undefined;

  saveMessage(db, {
    zetelId,
    role: 'user',
    content: userMessage,
    pageIndex,
    model,
    meta: { pageAnchor, pageHashMatch },
  });

  const encoder = new TextEncoder();

  const HOLD = NOTE_MARK_START.length - 1; // tail retido p/ marcador partido entre chunks

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';
      let emittedLen = 0; // quanto de `fullContent` já foi para o cliente
      let markerFound = false;
      const usageSink: UsageSink = {};

      const emit = (text: string) => {
        if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
      };

      try {
        for await (const chunk of streamChat({
          apiKey,
          model,
          messages: openRouterMessages,
          usageSink,
        })) {
          fullContent += chunk;
          if (markerFound) continue; // já em modo "só acumula" (bloco da sugestão)

          const idx = fullContent.indexOf(NOTE_MARK_START);
          if (idx !== -1) {
            // Emite a narrativa até o marcador e para — o bloco (e a justificativa)
            // nunca chega ao cliente.
            emit(fullContent.slice(emittedLen, idx));
            emittedLen = idx;
            markerFound = true;
          } else {
            // Retém um sufixo do tamanho do marcador, caso ele esteja partido.
            const safeEnd = Math.max(emittedLen, fullContent.length - HOLD);
            if (safeEnd > emittedLen) {
              emit(fullContent.slice(emittedLen, safeEnd));
              emittedLen = safeEnd;
            }
          }
        }

        // Sem marcador: libera o tail retido.
        if (!markerFound && emittedLen < fullContent.length) {
          emit(fullContent.slice(emittedLen));
          emittedLen = fullContent.length;
        }

        const { narrative, suggestion } = extractNoteSuggestion(fullContent);

        const saved = saveMessage(db, {
          zetelId,
          role: 'assistant',
          content: narrative,
          pageIndex,
          model,
          meta: {
            pageAnchor,
            pageHashMatch,
            tokensIn: usageSink.tokensIn,
            tokensOut: usageSink.tokensOut,
            suggestedNote: suggestion ? true : undefined,
            noteTipo: suggestion?.tipo,
          },
        });

        if (suggestion) {
          // Evento separado, sem `justificativa`. Inclui o id da mensagem p/ Rejeitar.
          const payload = JSON.stringify({ messageId: saved.id, model, ...suggestion });
          controller.enqueue(encoder.encode(`data: [SUGGESTION] ${payload}\n\n`));
        }
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
