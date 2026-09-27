import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  clearHistory,
  getPageByIndex,
  listMessages,
  listRecentMessages,
  saveMessage,
  updateOwnedMessageMeta,
} from '@/lib/chat-service';
import {
  createStudySession, getStudySession, resolveCurrentStudySession,
  touchStudySession, updateStudySession,
} from '@/lib/study-session-service';
import {
  buildOpenRouterMessages,
  ensureParceiroPrompt,
  extractNoteSuggestion,
  extractMemorySuggestion,
  NOTE_MARK_START,
  MEMORY_MARK_START,
  type ReadingLocationContext,
  resolveChatModel,
  resolveHistoryWindow,
} from '@/lib/chat-prompt';
import { ensureSugestaoNotaPrompt, listNoteTitles } from '@/lib/notes-service';
import { ensureSugestaoMemoriaPrompt } from '@/lib/memory-service';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { compileTutorInstructions } from '@/lib/tutor-profiles';
import { resolveSessionTutorProfile } from '@/lib/tutor-profile-service';
import { readApiKey, streamChat, type UsageSink } from '@/lib/openrouter';
import { getOpenRouterModel } from '@/lib/config';
import { getSetting } from '@/lib/settings';
import { getZetelById } from '@/lib/zetel-service';
import {
  nextSessionFocus,
  parseFocusCommand,
  parsePdfPageFocus,
  resolvePdfPageFocus,
  verifyPdfSelection,
  type ResolvedPdfPageFocus,
  type VerifiedSelection,
} from '@/lib/focus';
import { collectTurnSources } from '@/lib/turn-sources';
import type { ChatMessageMeta } from '@/types/chat-message';
import { logger } from '@/lib/logger';
import {
  findStudyGuideSourceEntry,
  readStudyGuideSourceMap,
  type SourceMapEntry,
} from '@/lib/study-guide-service';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const KEY_ERROR =
  'Chave OpenRouter não configurada. Defina OPENROUTER_API_KEY em ~/.zetel/config.';

function optionalShortString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function friendlyKeyError(err: unknown): string | null {
  if (err instanceof Error && err.message.includes('não configurada')) {
    return KEY_ERROR;
  }
  return null;
}

/** GET /api/zetels/[id]/chat */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (sessionId === '') {
    return NextResponse.json({ error: 'sessionId inválido.' }, { status: 400 });
  }
  const session = sessionId
    ? getStudySession(db, id, sessionId)
    : resolveCurrentStudySession(db, id);
  if (sessionId && !session) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ sessionId: session?.id ?? null,
    messages: session ? listMessages(db, id, session.id) : [] });
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

  let body: { messageId?: unknown; sessionId?: unknown; rejected?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : '';
  if (!messageId) {
    return NextResponse.json({ error: 'messageId ausente.' }, { status: 400 });
  }
  if (body.sessionId !== undefined &&
      (typeof body.sessionId !== 'string' || !body.sessionId)) {
    return NextResponse.json({ error: 'sessionId inválido.' }, { status: 400 });
  }
  const sessionId = body.sessionId as string | undefined;
  if (sessionId && !getStudySession(db, id, sessionId)) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  const patch = body.rejected === true
    ? body.kind === 'memory' ? { memoryRejected: true } : { noteRejected: true }
    : {};
  if (!updateOwnedMessageMeta(db, id, messageId, patch, sessionId)) {
    return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/zetels/[id]/chat */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'sessionId ausente.' }, { status: 400 });
  if (!getStudySession(db, id, sessionId)) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  clearHistory(db, id, sessionId);
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

  let body: {
    userMessage?: unknown;
    pageIndex?: unknown;
    model?: unknown;
    readingMode?: unknown;
    guideBlockId?: unknown;
    guideSectionId?: unknown;
    guideBlockTitle?: unknown;
    guideBlockIndex?: unknown;
    guideBlockTotal?: unknown;
    interactionMode?: unknown;
    focus?: unknown;
    sessionId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
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
  if (body.sessionId !== undefined &&
      (typeof body.sessionId !== 'string' || !body.sessionId)) {
    return NextResponse.json({ error: 'sessionId inválido.' }, { status: 400 });
  }
  const requestedSessionId = body.sessionId as string | undefined;
  const requestedSession = requestedSessionId
    ? getStudySession(db, zetelId, requestedSessionId) : null;
  if (requestedSessionId && !requestedSession) {
    return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  }
  if (requestedSession?.status === 'archived') {
    return NextResponse.json({ error: 'Sessão arquivada.' }, { status: 409 });
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

  const interactionMode: 'text' | 'voice' = body.interactionMode === 'voice' ? 'voice' : 'text';

  const readingMode = body.readingMode === 'guia-estudo' ? 'guia-estudo' : 'tecnico';
  const guideBlockId = optionalShortString(body.guideBlockId, 120);
  const guideSectionId = optionalShortString(body.guideSectionId, 120);
  const guideBlockTitle = optionalShortString(body.guideBlockTitle, 300);

  function optionalPositiveInt(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const guideBlockIndex = readingMode === 'guia-estudo' ? optionalPositiveInt(body.guideBlockIndex) : null;
  const guideBlockTotal = readingMode === 'guia-estudo' ? optionalPositiveInt(body.guideBlockTotal) : null;

  let guideSourceEntry: SourceMapEntry | null = null;
  const vaultPath = getSetting('vault_path');
  if (readingMode === 'guia-estudo' && vaultPath && guideBlockId) {
    guideSourceEntry = findStudyGuideSourceEntry(
      readStudyGuideSourceMap(vaultPath, zetel.slug),
      guideBlockId,
    );
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
  if (pageIndex === null && guideSourceEntry?.page_indices?.length) {
    pageIndex = guideSourceEntry.page_indices[0] ?? null;
  }

  // Foco de página PDF (tarefa 003): o cliente manda só fileId/pageNumber; texto
  // e hash vêm de `pdf_pages`. Qualquer conteúdo enviado junto é ignorado.
  const focusInput = parsePdfPageFocus(body.focus);
  if (focusInput === 'invalid') {
    return NextResponse.json({ error: 'Foco inválido.' }, { status: 400 });
  }
  if (focusInput && (pageIndex !== null || readingMode === 'guia-estudo')) {
    return NextResponse.json(
      { error: 'Foco de PDF não combina com página do Documento Técnico ou Guia.' },
      { status: 400 },
    );
  }
  let pdfFocus: ResolvedPdfPageFocus | null = null;
  if (focusInput) {
    pdfFocus = resolvePdfPageFocus(db, zetelId, focusInput);
    if (!pdfFocus) {
      return NextResponse.json(
        { error: 'Página do PDF não encontrada neste Zetel. Processe os arquivos e tente de novo.' },
        { status: 400 },
      );
    }
  }

  // Seleção (tarefa 004, D5): só vale se for substring normalizada do texto da
  // página no servidor; o prompt recebe o recorte do servidor. Não verificada →
  // descartada, o turno segue com o foco da página.
  let selection: VerifiedSelection | null = null;
  const selectionSent = pdfFocus !== null && focusInput?.selectionText !== undefined;
  if (pdfFocus && focusInput?.selectionText !== undefined) {
    selection = verifyPdfSelection(pdfFocus.contentText, focusInput.selectionText);
    if (!selection) {
      logger.info('pdf selection unverified', {
        zetelId,
        fileId: pdfFocus.fileId,
        pageNumber: pdfFocus.pageNumber,
      });
    }
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

  const session = requestedSession ?? resolveCurrentStudySession(db, zetelId) ??
    createStudySession(db, zetelId, {
      focus: pdfFocus
        ? { scope: 'page', fileId: pdfFocus.fileId, pageNumber: pdfFocus.pageNumber }
        : pageIndex !== null
          ? { scope: 'page', fileId: null, pageNumber: pageIndex }
          : null,
    });
  const focusCommand = parseFocusCommand(userMessage);
  const sessionFocus = nextSessionFocus({
    current: session.focus,
    command: focusCommand,
    pdf: pdfFocus ? { fileId: pdfFocus.fileId, pageNumber: pdfFocus.pageNumber } : null,
    markdownPage: pageIndex,
  });
  updateStudySession(db, zetelId, session.id, { focus: sessionFocus, status: 'active' });
  const turnSources = pdfFocus
    ? collectTurnSources(db, {
        zetelId,
        userMessage,
        pdfFocus,
        selection,
        focus: sessionFocus,
        allowRetrieval: !focusCommand.onlyThisPage,
      })
    : null;

  const model = resolveChatModel(
    typeof body.model === 'string' ? body.model : undefined,
    getSetting('chat_model') || getSetting('default_model'),
    getOpenRouterModel(),
  );

  const historyWindow = resolveHistoryWindow(getSetting('chat_history_window'));
  const history = listRecentMessages(db, zetelId, session.id, historyWindow);

  // Prompt do parceiro + rubricas + títulos (Módulo 8: parceiro.md lido do vault).
  // Sem vault, degrada como chat simples (regra #5: leitura sob demanda, nunca cache).
  let partnerPrompt: string | undefined;
  let noteRubric: string | undefined;
  let memoryRubric: string | undefined;
  let existingTitles: string[] | undefined;
  if (vaultPath) {
    try {
      partnerPrompt = await ensureParceiroPrompt(vaultPath);
      noteRubric = ensureSugestaoNotaPrompt(vaultPath);
      memoryRubric = ensureSugestaoMemoriaPrompt(vaultPath);
      existingTitles = listNoteTitles(vaultPath, zetel.slug);
    } catch (err) {
      logger.error('rubric/titles load failed', { zetelId, error: (err as Error).message });
    }
  }

  const readingLocation: ReadingLocationContext | undefined = pdfFocus ? undefined : {
    readingMode,
    pageIndex,
    guideBlockId,
    guideSectionId,
    guideBlockTitle,
    guideBlockIndex,
    guideBlockTotal,
    sourceHeadings: guideSourceEntry?.source_headings,
    sourceBlockHashes: guideSourceEntry?.source_block_hashes,
    sourceFiles: guideSourceEntry?.source_files,
    sourcePageIndices: guideSourceEntry?.page_indices,
  };

  // Memória global é lida sob demanda dentro de buildOpenRouterMessages (regra #5).
  const tutorProfile = resolveSessionTutorProfile(db, session.profileId, session.profileOverrides);
  const { messages: openRouterMessages, memoryWarnings } = buildOpenRouterMessages({
    displayName: zetel.displayName,
    pageContent,
    history,
    userMessage,
    readingLocation,
    partnerPrompt,
    noteRubric,
    memoryRubric,
    existingTitles,
    vaultPath: vaultPath ?? undefined,
    interactionMode,
    sources: turnSources?.promptSources,
    tutorInstructions: compileTutorInstructions(tutorProfile),
  });
  if (memoryWarnings.truncatedCount > 0) {
    // Regra #6: só contagem, nunca conteúdo.
    logger.info('memory truncated', { memorias_truncadas: memoryWarnings.truncatedCount });
  }

  // Cliente não envia conteúdo de página (D8); a fonte é sempre `zetel_pages`,
  // então o hash sempre confere quando há página.
  const pageHashMatch = pageIndex !== null ? true : undefined;

  // Localização persistida no meta: só IDs, número de página e hash (regra #6).
  const locationMeta: ChatMessageMeta = pdfFocus
    ? {
        focusFileId: pdfFocus.fileId,
        focusPageNumber: pdfFocus.pageNumber,
        focusContentHash: pdfFocus.contentHash,
        // Seleção: só flag, offsets e hash do recorte do servidor — nunca o texto.
        ...(selectionSent ? { selectionVerified: selection !== null } : {}),
        ...(selection
          ? {
              selectionStart: selection.start,
              selectionEnd: selection.end,
              selectionHash: selection.hash,
            }
          : {}),
      }
    : {
        readingMode,
        guideBlockId: guideBlockId ?? undefined,
        guideSectionId: guideSectionId ?? undefined,
      };

  saveMessage(db, {
    zetelId,
    sessionId: session.id,
    role: 'user',
    content: userMessage,
    pageIndex,
    model,
    meta: {
      pageAnchor,
      pageHashMatch,
      ...locationMeta,
    },
  });
  touchStudySession(db, zetelId, session.id);

  const encoder = new TextEncoder();

  // Ambas as sentinelas (nota e memória) são retidas server-side (regra #9).
  const MARKS = [NOTE_MARK_START, MEMORY_MARK_START];
  const HOLD = Math.max(...MARKS.map((m) => m.length)) - 1; // tail p/ marcador partido entre chunks
  /** Índice do marcador (nota OU memória) que aparece mais cedo, ou -1. */
  const earliestMark = (s: string): number => {
    let idx = -1;
    for (const m of MARKS) {
      const i = s.indexOf(m);
      if (i !== -1 && (idx === -1 || i < idx)) idx = i;
    }
    return idx;
  };

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
        if (turnSources && Object.keys(turnSources.sourceMap).length > 0) {
          controller.enqueue(
            encoder.encode(`data: [SOURCES] ${JSON.stringify(turnSources.sourceMap)}\n\n`),
          );
        }
        for await (const chunk of streamChat({
          apiKey,
          model,
          messages: openRouterMessages,
          usageSink,
        })) {
          fullContent += chunk;
          if (markerFound) continue; // já em modo "só acumula" (bloco da sugestão)

          const idx = earliestMark(fullContent);
          if (idx !== -1) {
            // Emite a narrativa até o primeiro marcador e para — os blocos (e as
            // justificativas) nunca chegam ao cliente.
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
        const { suggestion: memorySuggestion } = extractMemorySuggestion(fullContent);
        // Narrativa final: corta no marcador mais cedo (a memória pode preceder a
        // nota). extractNoteSuggestion já corta no NOTE_MARK, mas não na memória.
        const cut = earliestMark(fullContent);
        const finalNarrative = cut !== -1 ? fullContent.slice(0, cut).trim() : narrative;
        const hasSuggestion = Boolean(suggestion || memorySuggestion);
        const rawHadContent = fullContent.trim().length > 0;
        const assistantContent =
          finalNarrative ||
          (hasSuggestion
            ? 'Preparei uma sugestão abaixo. Se quiser, posso explicar ou ajustar antes de você guardar.'
            : '');

        if (!assistantContent) {
          if (rawHadContent) {
            // Conteúdo bruto chegou mas a narrativa ficou vazia após o corte dos
            // marcadores (sentinela malformada ou incompleta sem sugestão válida).
            logger.warn('chat stream: narrative cut without parseable suggestion', {
              zetelId,
              model,
              rawLength: fullContent.length,
              markerFound: markerFound ? 1 : 0,
              suggestionParsed: suggestion ? 1 : 0,
              memorySuggestionParsed: memorySuggestion ? 1 : 0,
            });
            const fallback =
              readingMode === 'guia-estudo'
                ? 'Não consegui formar uma resposta textual completa neste turno. Tente reformular a pergunta ou pergunte diretamente pelo bloco atual do Guia.'
                : 'Não consegui formar uma resposta textual completa neste turno. Tente reformular a pergunta ou consulte o documento atual.';
            emit(fallback);
            saveMessage(db, {
              zetelId,
              sessionId: session.id,
              role: 'assistant',
              content: fallback,
              pageIndex,
              model,
              meta: {
                pageAnchor,
                pageHashMatch,
                tokensIn: usageSink.tokensIn,
                tokensOut: usageSink.tokensOut,
                ...locationMeta,
              },
            });
          } else {
            logger.warn('chat stream ended without visible content', { zetelId, model });
            controller.enqueue(
              encoder.encode(
                'data: [ERROR] O parceiro encerrou a resposta sem conteúdo visível. Tente novamente.\n\n',
              ),
            );
          }
          controller.close();
          return;
        }

        if (!finalNarrative && hasSuggestion) {
          emit(assistantContent);
        }

        const saved = saveMessage(db, {
          zetelId,
          sessionId: session.id,
          role: 'assistant',
          content: assistantContent,
          pageIndex,
          model,
          meta: {
            pageAnchor,
            pageHashMatch,
            tokensIn: usageSink.tokensIn,
            tokensOut: usageSink.tokensOut,
            suggestedNote: suggestion ? true : undefined,
            noteTipo: suggestion?.tipo,
            suggestedMemory: memorySuggestion ? true : undefined,
            memoryLong: memoryWarnings.hasLongFile || undefined,
            ...locationMeta,
            ...(turnSources && Object.keys(turnSources.sourceMap).length > 0
              ? { sources: turnSources.sourceMap }
              : {}),
          },
        });

        if (suggestion) {
          // Evento separado, sem `justificativa`. Inclui o id da mensagem p/ Rejeitar.
          const payload = JSON.stringify({ messageId: saved.id, model, ...suggestion });
          controller.enqueue(encoder.encode(`data: [SUGGESTION] ${payload}\n\n`));
        }
        if (memorySuggestion) {
          // Sem `justificativa`. messageId p/ o PATCH de rejeição de memória.
          const payload = JSON.stringify({ messageId: saved.id, model, ...memorySuggestion });
          controller.enqueue(encoder.encode(`data: [MEMORY_SUGGESTION] ${payload}\n\n`));
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
      'X-Study-Session-Id': session.id,
    },
  });
}
