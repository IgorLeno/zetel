'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatMessage, CitedSource } from '@/types/chat-message';
import type { StudySession } from '@/types/study-session';
import { toSpeakable } from '@/lib/speech-text';
import { starterCanonical, type ChatStarter } from '@/lib/chat-starters';
import { FonteText } from './FonteText';
import { NoteCard, type Suggestion, type SaveNotePayload } from './NoteCard';
import { MemoryCard, type MemorySuggestionData } from './MemoryCard';
import { ConceptCard, type ConceptSuggestionData } from './ConceptCard';
import { TutorProfilePanel } from './TutorProfilePanel';
import { useTtsQueue, extractSentences } from '@/hooks/useTtsQueue';

type ReadingMode = 'tecnico' | 'guia-estudo';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'stopped' | 'error';

const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  idle: '',
  listening: 'Ouvindo',
  thinking: 'Pensando',
  speaking: 'Falando',
  stopped: 'Parado',
  error: 'Erro',
};

const VOICE_PREFS_KEY = 'zetel_voice_prefs';

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function loadVoicePrefs(): { micAtivo: boolean; autoPlay: boolean } {
  try {
    const raw = localStorage.getItem(VOICE_PREFS_KEY);
    if (!raw) return { micAtivo: false, autoPlay: false };
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null)
      return { micAtivo: false, autoPlay: false };
    const p = parsed as Record<string, unknown>;
    return {
      micAtivo: p.micAtivo === true,
      autoPlay: p.autoPlay === true,
    };
  } catch {
    return { micAtivo: false, autoPlay: false };
  }
}

function saveVoicePrefs(micAtivo: boolean, autoPlay: boolean): void {
  try {
    localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify({ micAtivo, autoPlay }));
  } catch {
    /* localStorage indisponível — prefs não persistem */
  }
}

function parseSseChunk(text: string): {
  chunks: string[];
  suggestion: Suggestion | null;
  memorySuggestion: MemorySuggestionData | null;
  conceptSuggestion: ConceptSuggestionData | null;
  sources: Record<string, CitedSource> | null;
  error: string | null;
  done: boolean;
} {
  const chunks: string[] = [];
  let suggestion: Suggestion | null = null;
  let memorySuggestion: MemorySuggestionData | null = null;
  let conceptSuggestion: ConceptSuggestionData | null = null;
  let sources: Record<string, CitedSource> | null = null;
  let error: string | null = null;
  let done = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    if (payload === '[DONE]') {
      done = true;
      continue;
    }
    if (payload.startsWith('[ERROR]')) {
      error = payload.slice('[ERROR]'.length).trim();
      done = true;
      continue;
    }
    if (payload.startsWith('[SOURCES]')) {
      try {
        const parsed = JSON.parse(payload.slice('[SOURCES]'.length).trim()) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          sources = parsed as Record<string, CitedSource>;
        }
      } catch {
        /* mapa malformado — citações ficam como texto */
      }
      continue;
    }
    if (payload.startsWith('[MEMORY_SUGGESTION]')) {
      try {
        memorySuggestion = JSON.parse(
          payload.slice('[MEMORY_SUGGESTION]'.length).trim(),
        ) as MemorySuggestionData;
      } catch {
        /* sugestão de memória malformada — ignora */
      }
      continue;
    }
    if (payload.startsWith('[CONCEPT_SUGGESTION]')) {
      try {
        conceptSuggestion = JSON.parse(
          payload.slice('[CONCEPT_SUGGESTION]'.length).trim(),
        ) as ConceptSuggestionData;
      } catch {
        /* sugestão malformada — ignora */
      }
      continue;
    }
    if (payload.startsWith('[SUGGESTION]')) {
      try {
        suggestion = JSON.parse(payload.slice('[SUGGESTION]'.length).trim()) as Suggestion;
      } catch {
        /* sugestão malformada — ignora */
      }
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as string;
      if (typeof parsed === 'string') chunks.push(parsed);
    } catch {
      /* ignora linha malformada */
    }
  }

  return { chunks, suggestion, memorySuggestion, conceptSuggestion, sources, error, done };
}

export function ChatPanel({
  zetelId,
  currentReadingMode,
  currentPageIndex,
  currentGuideBlockId,
  currentGuideSectionId,
  currentGuideBlockTitle,
  currentGuideBlockIndex,
  currentGuideBlockTotal,
  pdfFocus = null,
  onClearPdfSelection,
  onOpenSource,
  onSessionChange,
  createSessionIfEmpty = false,
  active = true,
}: {
  zetelId: string;
  currentReadingMode: ReadingMode;
  currentPageIndex: number | null;
  currentGuideBlockId: string | null;
  currentGuideSectionId: string | null;
  currentGuideBlockTitle: string | null;
  currentGuideBlockIndex: number | null;
  currentGuideBlockTotal: number | null;
  /**
   * Página do leitor PDF (tarefa 003). Só IDs: o texto vem do servidor.
   * `selectionText` (tarefa 004) é candidato; o servidor verifica e usa o próprio recorte.
   */
  pdfFocus?: { fileId: string; pageNumber: number; selectionText?: string } | null;
  /** Citação `[fonte:Sn]` com destino conhecido abre o PDF nessa página. */
  onOpenSource?: (target: { fileId: string; pageNumber: number }) => void;
  /** Descarta a seleção anexada (✕ no chip ou após o turno aceito). */
  onClearPdfSelection?: () => void;
  onSessionChange?: (session: StudySession | null) => void;
  createSessionIfEmpty?: boolean;
  active?: boolean;
}) {
  const router = useRouter();
  // Ref: o fluxo de voz chama sendMessage por closures antigas; a página enviada
  // precisa ser a atual. Mudar de página só atualiza a ref (não dispara turno).
  const pdfFocusRef = useRef(pdfFocus);
  useEffect(() => { pdfFocusRef.current = pdfFocus; }, [pdfFocus]);

  // ── Core chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [streaming, setStreaming] = useState('');
  const [turnSources, setTurnSources] = useState<Record<string, CitedSource> | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestion, setSuggestion] = useState<{ data: Suggestion; canDiscuss: boolean } | null>(
    null,
  );
  const [memorySuggestion, setMemorySuggestion] = useState<{
    data: MemorySuggestionData;
    canDiscuss: boolean;
  } | null>(null);
  const [conceptSuggestion, setConceptSuggestion] = useState<ConceptSuggestionData | null>(null);
  const [conceptBusy, setConceptBusy] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [teacherOpen, setTeacherOpen] = useState(false);

  // ── Voice UI state ───────────────────────────────────────────────────────────
  // Default false para evitar mismatch SSR; localStorage é lido no useEffect.
  const [voiceStatus, setVoiceStatus] = useState<{ tts: boolean; sttServer: boolean } | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [micAtivo, setMicAtivo] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  // ── Refs (leitura síncrona em callbacks assíncronos) ─────────────────────────
  const micAtivoRef = useRef(false);
  const autoPlayRef = useRef(false);
  const isLoadingRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>('idle');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Mic foi restaurado como ativo mas ainda não iniciou — aguarda gesto do usuário.
  const pendingMicStartRef = useRef(false);
  // Usuário parou o TTS manualmente — reinicia o mic no finally se o turno ainda estiver carregando.
  const userCancelledTtsRef = useRef(false);
  // Frases que chegarem depois de Parar não entram na fila deste turno.
  const turnCancelledRef = useRef(false);
  const turnSeqRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);

  // Container do painel — usado para o listener de gesto que inicia o mic pendente.
  const chatPanelRef = useRef<HTMLElement>(null);

  const discussNextRef = useRef(false);
  const discussNextMemoryRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // "Conversar sobre isto" (tarefa 004): nova seleção sugere uma pergunta e foca o input.
  const pdfSelectionText = pdfFocus?.selectionText;
  useEffect(() => {
    if (!pdfSelectionText) return;
    setInput((cur) => (cur.trim() ? cur : 'Explique este trecho.'));
    inputRef.current?.focus();
  }, [pdfSelectionText]);

  // ── TTS streaming queue ──────────────────────────────────────────────────────
  const tts = useTtsQueue({
    onPlaybackStateChange: (speaking) => {
      if (turnCancelledRef.current) {
        voiceStateRef.current = 'stopped';
        setVoiceState('stopped');
        return;
      }
      if (speaking) {
        voiceStateRef.current = 'speaking';
        setVoiceState('speaking');
      } else if (isLoadingRef.current) {
        voiceStateRef.current = 'thinking';
        setVoiceState('thinking');
      } else if (voiceStateRef.current === 'speaking') {
        voiceStateRef.current = 'idle';
        setVoiceState('idle');
      }
    },
    onTurnDrained: () => maybeRestartMic(),
  });

  const visibleMessages = messages.filter(
    (m) => !(m.role === 'assistant' && m.content.trim().length === 0),
  );

  // ── Sync refs com estado ─────────────────────────────────────────────────────
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  async function restoreConceptCard(history: ChatMessage[], expectedSessionId: string) {
    const pending = [...history].reverse().find((message) => message.role === 'assistant' &&
      message.meta?.conceptSuggestion && !message.meta.conceptRejected && !message.meta.conceptSaved);
    if (!pending?.meta?.conceptSuggestion) return;
    const data = pending.meta.conceptSuggestion;
    const source = data.sourceId ? pending.meta.sources?.[data.sourceId] : null;
    try {
      const res = await fetch(`/api/zetels/${zetelId}/concepts?name=${encodeURIComponent(data.nome)}`);
      if (!res.ok || sessionIdRef.current !== expectedSessionId) return;
      const result = await res.json() as { existing: ConceptSuggestionData['existing'] };
      setConceptSuggestion({ messageId: pending.id, ...data,
        sourceLabel: source ? `${source.filename} · p. ${source.pageNumber}` : null,
        existing: result.existing });
    } catch {
      /* cartão pode voltar no próximo carregamento; histórico continua íntegro */
    }
  }

  // ── Sessão e histórico ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/zetels/${zetelId}/sessions`);
        if (!res.ok) throw new Error('sessions');
        const data = await res.json() as { sessions: StudySession[] };
        let available = data.sessions;
        const wanted = new URL(window.location.href).searchParams.get('session');
        let selected = available.find((s) => s.id === wanted && s.status !== 'archived') ??
          available.find((s) => s.status === 'active') ??
          available.find((s) => s.status !== 'archived') ?? null;
        if (!selected && createSessionIfEmpty) {
          const focus = pdfFocusRef.current;
          const created = await fetch(`/api/zetels/${zetelId}/sessions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ focus: focus
              ? { scope: 'page', fileId: focus.fileId, pageNumber: focus.pageNumber } : null }),
          });
          if (!created.ok) throw new Error('create session');
          selected = (await created.json() as { session: StudySession }).session;
          available = [selected, ...available];
        }
        if (cancelled) return;
        setSessions(available);
        sessionIdRef.current = selected?.id ?? null;
        setSessionId(selected?.id ?? null);
        onSessionChange?.(selected);
        if (selected) {
          const history = await fetch(`/api/zetels/${zetelId}/chat?sessionId=${encodeURIComponent(selected.id)}`);
          if (!history.ok) throw new Error('history');
          const result = await history.json() as { messages: ChatMessage[] };
          if (!cancelled) {
            setMessages(result.messages);
            void restoreConceptCard(result.messages, selected.id);
          }
        } else {
          setMessages([]);
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar o histórico.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zetelId, active, createSessionIfEmpty, onSessionChange]);

  const initialMarkdownPage = useRef<number | null | undefined>(undefined);
  const markdownFocusWrite = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!active || pdfFocus) return;
    if (initialMarkdownPage.current === undefined) {
      initialMarkdownPage.current = currentPageIndex;
      return;
    }
    if (initialMarkdownPage.current === currentPageIndex) return;
    initialMarkdownPage.current = currentPageIndex;
    const id = sessionIdRef.current;
    if (!id || currentPageIndex === null) return;
    markdownFocusWrite.current = markdownFocusWrite.current.then(async () => {
      const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id,
          focus: { scope: 'page', fileId: null, pageNumber: currentPageIndex } }),
      });
      if (!res.ok) throw new Error('focus');
    }).catch(() => setError('Não foi possível guardar a posição da página.'));
  }, [active, currentPageIndex, pdfFocus, zetelId]);

  async function chooseSession(session: StudySession) {
    if (isLoading || session.status === 'archived') return;
    try {
      const activated = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, status: 'active' }),
      });
      if (!activated.ok) throw new Error('activate');
      const current = (await activated.json() as { session: StudySession }).session;
      sessionIdRef.current = current.id;
      setSessionId(current.id);
      setMessages([]);
      setLoaded(false);
      setSessions((items) => items.map((s) => s.id === current.id ? current
        : s.status === 'active' ? { ...s, status: 'paused' } : s));
      setSuggestion(null);
      setMemorySuggestion(null);
      setConceptSuggestion(null);
      onSessionChange?.(current);
      const history = await fetch(`/api/zetels/${zetelId}/chat?sessionId=${encodeURIComponent(current.id)}`);
      if (!history.ok) throw new Error('history');
      const historyMessages = (await history.json() as { messages: ChatMessage[] }).messages;
      setMessages(historyMessages);
      void restoreConceptCard(historyMessages, current.id);
      const url = new URL(window.location.href);
      url.searchParams.set('session', current.id);
      if (current.focus?.fileId) {
        url.searchParams.set('view', 'pdf');
        url.searchParams.set('file', current.focus.fileId);
        url.searchParams.set('page', String(current.focus.pageNumber ?? 1));
      } else if (url.searchParams.get('view') === 'pdf') {
        url.searchParams.set('view', 'tecnico');
        url.searchParams.delete('file');
        url.searchParams.delete('page');
      }
      router.push(`${url.pathname}${url.search}`);
    } catch {
      setError('Não foi possível continuar a sessão.');
    } finally {
      setLoaded(true);
    }
  }

  async function newSession() {
    if (isLoading) return;
    try {
      const focus = pdfFocusRef.current;
      const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: focus
          ? { scope: 'page', fileId: focus.fileId, pageNumber: focus.pageNumber }
          : currentPageIndex !== null
            ? { scope: 'page', fileId: null, pageNumber: currentPageIndex } : null }),
      });
      if (!res.ok) throw new Error('create');
      const created = (await res.json() as { session: StudySession }).session;
      setSessions((items) => [created, ...items.map((s) => s.status === 'active'
        ? { ...s, status: 'paused' as const } : s)]);
      sessionIdRef.current = created.id;
      setSessionId(created.id);
      setMessages([]);
      setSuggestion(null);
      setMemorySuggestion(null);
      setConceptSuggestion(null);
      onSessionChange?.(created);
      const url = new URL(window.location.href);
      url.searchParams.set('session', created.id);
      router.push(`${url.pathname}${url.search}`);
    } catch {
      setError('Não foi possível criar a sessão.');
    }
  }

  async function renameSession() {
    const id = sessionIdRef.current;
    const current = sessions.find((s) => s.id === id);
    if (!current) return;
    const title = window.prompt('Nome da sessão', current.title);
    if (title === null || title.trim() === current.title) return;
    try {
      const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, title }),
      });
      if (!res.ok) throw new Error('rename');
      const renamed = (await res.json() as { session: StudySession }).session;
      setSessions((items) => items.map((s) => s.id === id ? renamed : s));
    } catch {
      setError('Não foi possível renomear a sessão.');
    }
  }

  // ── Verifica disponibilidade de voz ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/voice/status');
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { tts: boolean; sttServer: boolean };
          setVoiceStatus(data);
        }
      } catch {
        /* voice indisponível — controles desabilitados */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Restaura prefs do localStorage (apenas estado visual; mic não inicia agora) ──
  useEffect(() => {
    const prefs = loadVoicePrefs();
    setMicAtivo(prefs.micAtivo);
    setAutoPlay(prefs.autoPlay);
    micAtivoRef.current = prefs.micAtivo;
    autoPlayRef.current = prefs.autoPlay;
    if (prefs.micAtivo) pendingMicStartRef.current = true;
  }, []);

  // ── Degradação: auto-play depende da chave TTS. O mic é Web Speech e não. ──
  useEffect(() => {
    if (!voiceStatus) return;
    let changed = false;
    if (autoPlayRef.current && !voiceStatus.tts) {
      autoPlayRef.current = false;
      setAutoPlay(false);
      changed = true;
    }
    if (changed) saveVoicePrefs(micAtivoRef.current, autoPlayRef.current);
  }, [voiceStatus]);

  // ── Listener one-time: inicia mic pendente no primeiro gesto do usuário ──────
  // Deps omitidas de propósito: handleFirstGesture/startListening só leem refs
  // (pendingMicStartRef, micAtivoRef) e chatPanelRef — sem props/state reativos.
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    function handleFirstGesture() {
      if (pendingMicStartRef.current && micAtivoRef.current) {
        pendingMicStartRef.current = false;
        startListening();
      }
      panel!.removeEventListener('pointerdown', handleFirstGesture);
    }
    panel.addEventListener('pointerdown', handleFirstGesture);
    return () => panel.removeEventListener('pointerdown', handleFirstGesture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup ao desmontar ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        rec.onend = null;
        rec.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, suggestion, memorySuggestion, conceptSuggestion, pendingUser, isLoading, scrollToBottom]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  // ── Web Speech API — reconhecimento contínuo ─────────────────────────────────

  function stopListeningClean(): void {
    const rec = recognitionRef.current;
    if (rec) {
      rec.onend = null; // impede auto-restart via onend
      rec.abort();
      recognitionRef.current = null;
    }
  }

  function stopListening(): void {
    stopListeningClean();
    voiceStateRef.current = 'idle';
    setVoiceState('idle');
  }

  function startListening(): void {
    if (!micAtivoRef.current) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    stopListeningClean(); // limpa instância anterior sem flash de estado

    try {
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      recognitionRef.current = rec;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const transcript = result[0].transcript.trim();
            if (transcript) {
              handleFinalTranscript(transcript);
              return;
            }
          }
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          micAtivoRef.current = false;
          setMicAtivo(false);
          pendingMicStartRef.current = false;
          saveVoicePrefs(false, autoPlayRef.current);
          setError('Microfone não disponível. Verifique as permissões do navegador.');
          voiceStateRef.current = 'error';
          setVoiceState('error');
        }
        // no-speech e aborted são benignos; onend trata o reinício
      };

      rec.onend = () => {
        voiceStateRef.current = 'idle';
        setVoiceState('idle');
        // Reinicia automaticamente se o mic ainda está ativo e não estamos carregando.
        // (Não há risco de conflito com TTS: handleFinalTranscript zera onend antes do abort.)
        if (micAtivoRef.current && !isLoadingRef.current) {
          startListening();
        }
      };

      rec.start();
      voiceStateRef.current = 'listening';
      setVoiceState('listening');
      setError(null);
    } catch {
      // start() pode lançar se browser rejeitar (e.g., já está rodando)
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
    }
  }

  function handleFinalTranscript(text: string): void {
    stopListening(); // para a captura durante o processamento
    setInput('');
    void sendMessage(text); // textOverride: evita race com setInput e mantém textarea limpo
  }

  function maybeRestartMic(): void {
    if (micAtivoRef.current && !isLoadingRef.current) {
      startListening();
    }
  }

  /** Corta o áudio do turno. O mic volta no finally, depois de liberar a entrada. */
  function abortVoiceTurn(): void {
    tts.cancel();
  }

  function stopPartner(): void {
    const streamStillOpen = isLoadingRef.current;
    turnCancelledRef.current = true;
    userCancelledTtsRef.current = true;
    voiceStateRef.current = 'stopped';
    setVoiceState('stopped');
    tts.cancel();
    chatAbortRef.current?.abort();
    isLoadingRef.current = false;
    setIsLoading(false);
    if (!streamStillOpen) maybeRestartMic();
    inputRef.current?.focus();
  }

  // ── Toggles ──────────────────────────────────────────────────────────────────

  function toggleMic(): void {
    const Ctor = getSpeechRecognitionCtor();
    const next = !micAtivoRef.current;
    if (next && !Ctor) {
      setError('Microfone não disponível neste navegador.');
      return;
    }
    micAtivoRef.current = next;
    setMicAtivo(next);
    pendingMicStartRef.current = false;
    saveVoicePrefs(next, autoPlayRef.current);
    if (next) {
      startListening();
    } else {
      stopListening();
    }
  }

  function toggleAutoPlay(): void {
    const next = !autoPlayRef.current;
    if (next && !voiceStatus?.tts) {
      setError('Auto-play de voz não disponível. Configure a chave TTS nas Configurações.');
      return;
    }
    autoPlayRef.current = next;
    setAutoPlay(next);
    saveVoicePrefs(micAtivoRef.current, next);
    if (!next) tts.cancel();
  }

  // TTS gerenciado por useTtsQueue (tts.beginTurn / enqueue / seal / cancel).

  // ── Chat functions ───────────────────────────────────────────────────────────

  async function clearHistory() {
    const id = sessionIdRef.current;
    if (!id || !confirm('Apagar o histórico desta sessão?')) return;
    setError(null);
    setClearing(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat?sessionId=${encodeURIComponent(id)}`,
        { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        setStreaming('');
        setSuggestion(null);
        setMemorySuggestion(null);
        setConceptSuggestion(null);
      } else {
        setError('Falha ao limpar o histórico.');
      }
    } catch {
      setError('Falha ao limpar o histórico.');
    } finally {
      setClearing(false);
    }
  }

  // textOverride: passado diretamente do fluxo de voz e de "Discutir" para evitar
  // race condition com setInput assíncrono (não lê o estado input nesses caminhos).
  async function sendMessage(textOverride?: string, starter?: ChatStarter) {
    const text = starter ? starterCanonical(starter) : (textOverride ?? input).trim();
    if (isLoading || !text) return;

    // D36: interactionMode derivado de autoPlay — estilo oral no backend quando autoPlay=ON
    const mode: 'text' | 'voice' = autoPlayRef.current ? 'voice' : 'text';

    const turn = ++turnSeqRef.current;
    const still = () => turn === turnSeqRef.current;
    turnCancelledRef.current = false;
    const abort = new AbortController();
    chatAbortRef.current = abort;

    // Cancela turno anterior e prepara nova fila de frases para TTS streaming.
    if (mode === 'voice') tts.beginTurn();

    setPendingUser(text); // bolha otimista — limpa no finally após histórico atualizado
    setTurnSources(null);
    if (!starter && textOverride === undefined) setInput('');
    if (starter) setTeacherOpen(false);
    setError(null);
    isLoadingRef.current = true;
    setIsLoading(true);
    voiceStateRef.current = 'thinking';
    setVoiceState('thinking');
    setStreaming('');
    setSuggestion(null);
    setMemorySuggestion(null);
    setConceptSuggestion(null);

    let turnSessionId: string | null = sessionIdRef.current;
    const loadInterruptedHistory = async () => {
      if (!still()) return;
      try {
        const histRes = await fetch(`/api/zetels/${zetelId}/chat${turnSessionId
          ? `?sessionId=${encodeURIComponent(turnSessionId)}` : ''}`);
        if (!still() || !histRes.ok) return;
        const histData = await histRes.json() as { messages?: ChatMessage[] };
        setMessages(histData.messages ?? []);
        setStreaming('');
      } catch {
        /* mantém o texto já recebido na bolha de streaming */
      }
    };

    let received: Suggestion | null = null;
    let receivedMemory: MemorySuggestionData | null = null;
    let receivedConcept: ConceptSuggestionData | null = null;
    let willPlayAudio = false;
    let speechRaw = '';
    let spokenCount = 0;

    const fail = (message: string) => {
      if (!still()) return;
      setError(message);
      voiceStateRef.current = 'error';
      setVoiceState('error');
    };

    const enqueueFresh = () => {
      if (mode !== 'voice' || turnCancelledRef.current) return;
      const { sentences } = extractSentences(toSpeakable(speechRaw));
      for (const sentence of sentences.slice(spokenCount)) tts.enqueue(sentence);
      spokenCount = sentences.length;
    };

    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify(
          pdfFocusRef.current
            ? {
                ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
                ...(starter ? { starter } : { userMessage: text }),
                focus: {
                  fileId: pdfFocusRef.current.fileId,
                  pageNumber: pdfFocusRef.current.pageNumber,
                  ...(pdfFocusRef.current.selectionText
                    ? { selectionText: pdfFocusRef.current.selectionText }
                    : {}),
                },
                interactionMode: mode,
              }
            : {
                ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
                ...(starter ? { starter } : { userMessage: text }),
                pageIndex: currentPageIndex,
                readingMode: currentReadingMode,
                guideBlockId: currentGuideBlockId,
                guideSectionId: currentGuideSectionId,
                guideBlockTitle: currentGuideBlockTitle,
                guideBlockIndex: currentGuideBlockIndex,
                guideBlockTotal: currentGuideBlockTotal,
                interactionMode: mode,
              },
        ),
      });

      if (!still()) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        fail(data.error ?? 'Falha ao enviar mensagem.');
        if (mode === 'voice') abortVoiceTurn();
        isLoadingRef.current = false;
        setIsLoading(false);
        return;
      }
      turnSessionId = res.headers.get('X-Study-Session-Id') ?? sessionIdRef.current;

      // Seleção vale para um turno só (tarefa 004).
      if (pdfFocusRef.current?.selectionText) onClearPdfSelection?.();

      if (!res.body) {
        fail('Resposta sem stream.');
        if (mode === 'voice') abortVoiceTurn();
        isLoadingRef.current = false;
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let streamError: string | null = null;
      // Buffer acumulador: uma linha `data:` pode chegar partida entre dois chunks.
      let sseBuffer = '';

      const flush = (t: string) => {
        const parsed = parseSseChunk(t);
        if (parsed.error) streamError = parsed.error;
        if (parsed.suggestion) received = parsed.suggestion;
        if (parsed.memorySuggestion) receivedMemory = parsed.memorySuggestion;
        if (parsed.conceptSuggestion) receivedConcept = parsed.conceptSuggestion;
        if (parsed.sources) setTurnSources(parsed.sources);
        if (parsed.done) return;
        for (const c of parsed.chunks) {
          accumulated += c;
          if (still()) setStreaming(accumulated);
          speechRaw += c;
          enqueueFresh();
        }
      };

      while (true) {
        if (abort.signal.aborted || !still()) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const boundary = sseBuffer.lastIndexOf('\n');
        if (boundary === -1) continue;
        flush(sseBuffer.slice(0, boundary + 1));
        sseBuffer = sseBuffer.slice(boundary + 1);
      }
      if (!abort.signal.aborted && still() && sseBuffer.trim()) flush(sseBuffer);

      if (abort.signal.aborted) {
        if (mode === 'voice') abortVoiceTurn();
        await loadInterruptedHistory();
      } else if (!still()) {
        return;
      } else if (streamError) {
        if (mode === 'voice') abortVoiceTurn();
        fail(streamError);
        await loadInterruptedHistory();
      } else if (!accumulated.trim() && !received && !receivedMemory && !receivedConcept) {
        if (mode === 'voice') abortVoiceTurn();
        fail('O parceiro encerrou a resposta sem conteúdo visível. Tente novamente.');
        setStreaming('');
      } else {
        const histRes = await fetch(`/api/zetels/${zetelId}/chat${turnSessionId
          ? `?sessionId=${encodeURIComponent(turnSessionId)}` : ''}`);
        const histData = await histRes.json();
        if (histRes.ok) {
          setMessages(histData.messages ?? []);
          setStreaming('');
          if (!sessionIdRef.current && turnSessionId) {
            sessionIdRef.current = turnSessionId;
            setSessionId(turnSessionId);
            const sessionsRes = await fetch(`/api/zetels/${zetelId}/sessions`);
            if (sessionsRes.ok) setSessions((await sessionsRes.json()).sessions ?? []);
          }
        }
        if (received) {
          setSuggestion({ data: received, canDiscuss: !discussNextRef.current });
        }
        if (receivedMemory) {
          setMemorySuggestion({
            data: receivedMemory,
            canDiscuss: !discussNextMemoryRef.current,
          });
        }
        if (receivedConcept) setConceptSuggestion(receivedConcept);
        // D36: TTS automático apenas quando autoPlay=ON; seal fecha a fila e reinicia mic.
        if (mode === 'voice' && accumulated.trim() && !turnCancelledRef.current) {
          willPlayAudio = true;
          const { rest } = extractSentences(toSpeakable(speechRaw));
          if (rest.trim()) tts.enqueue(rest.trim());
          tts.seal();
        }
        if (!willPlayAudio && voiceStateRef.current === 'thinking') {
          voiceStateRef.current = 'idle';
          setVoiceState('idle');
        }
      }
    } catch (err) {
      if (!still()) return;
      if (abort.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        if (mode === 'voice') abortVoiceTurn();
        await loadInterruptedHistory();
        return;
      }
      if (mode === 'voice') abortVoiceTurn();
      fail('Erro de rede ao conversar com o parceiro.');
      if (!(err instanceof Error && err.name === 'AbortError')) setStreaming('');
    } finally {
      if (!still()) return;
      discussNextRef.current = false;
      discussNextMemoryRef.current = false;
      isLoadingRef.current = false;
      setIsLoading(false);
      setPendingUser(null); // remove bolha otimista; histórico real já foi carregado
      inputRef.current?.focus();
      // TTS ativo: seal/onTurnDrained reinicia o mic ao terminar. Erro, vazio ou parada manual:
      // reinicia aqui (parada manual durante isLoading só é segura após setIsLoading(false)).
      if (!willPlayAudio || userCancelledTtsRef.current) {
        maybeRestartMic();
      }
      userCancelledTtsRef.current = false;
      if (chatAbortRef.current === abort) chatAbortRef.current = null;
    }
  }

  async function saveNote(payload: SaveNotePayload) {
    if (!suggestion) return;
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: suggestion.data.tipo,
          titulo: payload.titulo ?? suggestion.data.titulo,
          corpo: payload.corpo,
          paginaOrigem: suggestion.data.paginaOrigem,
          modelo: suggestion.data.model,
          interpretacaoUsuario: payload.interpretacaoUsuario ?? null,
        }),
      });
      if (res.ok) {
        setSuggestion(null);
        showToast('Nota guardada.');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha ao guardar a nota.');
      }
    } catch {
      setError('Erro de rede ao guardar a nota.');
    } finally {
      setNoteBusy(false);
    }
  }

  async function rejectNote() {
    if (!suggestion) return;
    const messageId = suggestion.data.messageId;
    setSuggestion(null);
    try {
      await fetch(`/api/zetels/${zetelId}/chat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, sessionId: sessionIdRef.current, rejected: true }),
      });
    } catch {
      /* flag só para auditoria; falha não bloqueia */
    }
    showToast('Sugestão descartada.');
  }

  function discussNote() {
    if (!suggestion) return;
    const { titulo, corpo } = suggestion.data;
    discussNextRef.current = true;
    void sendMessage(
      `Sobre esta sugestão de nota ("${titulo}"): o que você acha de refiná-la? Rascunho atual:\n\n${corpo}`,
    );
  }

  async function saveMemory(titulo: string, corpo: string) {
    if (!memorySuggestion) return;
    setMemoryBusy(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          corpo,
          zetelOrigem: zetelId,
          modelo: memorySuggestion.data.model,
          messageId: memorySuggestion.data.messageId,
        }),
      });
      if (res.ok) {
        setMemorySuggestion(null);
        showToast('Memória guardada.');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha ao guardar a memória.');
      }
    } catch {
      setError('Erro de rede ao guardar a memória.');
    } finally {
      setMemoryBusy(false);
    }
  }

  async function rejectMemory() {
    if (!memorySuggestion) return;
    const messageId = memorySuggestion.data.messageId;
    setMemorySuggestion(null);
    try {
      await fetch(`/api/zetels/${zetelId}/chat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, sessionId: sessionIdRef.current,
          rejected: true, kind: 'memory' }),
      });
    } catch {
      /* flag só para auditoria */
    }
    showToast('Memória rejeitada.');
  }

  function discussMemory() {
    if (!memorySuggestion) return;
    const { titulo, corpo } = memorySuggestion.data;
    discussNextMemoryRef.current = true;
    void sendMessage(
      `Sobre esta sugestão de memória ("${titulo}"): o que você acha de refiná-la? Rascunho atual:\n\n${corpo}`,
    );
  }

  async function saveConcept(edit: { name: string; userFormulation: string | null;
    partnerFormulation: string; action: 'create' | 'append'; conceptSlug?: string }) {
    if (!conceptSuggestion) return;
    setConceptBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/concepts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: conceptSuggestion.messageId, ...edit }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha ao salvar conceito.');
        return;
      }
      setConceptSuggestion(null);
      showToast(edit.action === 'append' ? 'Formulação adicionada ao conceito.' : 'Conceito salvo.');
    } catch {
      setError('Erro de rede ao salvar conceito.');
    } finally {
      setConceptBusy(false);
    }
  }

  function exploreConcept() {
    if (!conceptSuggestion) return;
    void sendMessage(`Quero explorar melhor o conceito de ${conceptSuggestion.nome} que você acabou de identificar.`);
  }

  async function ignoreConcept() {
    if (!conceptSuggestion) return;
    setConceptBusy(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: conceptSuggestion.messageId,
          sessionId: sessionIdRef.current, rejected: true, kind: 'concept' }),
      });
      if (!res.ok) throw new Error('ignore');
      setConceptSuggestion(null);
      showToast('Sugestão ignorada.');
    } catch {
      setError('Não foi possível ignorar a sugestão.');
    } finally {
      setConceptBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  /* SVG icons — inline to keep the component self-contained */
  const icMic = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="5" y="1" width="6" height="9" rx="3" strokeLinecap="round"/>
      <path d="M3 8a5 5 0 0 0 10 0" strokeLinecap="round"/>
      <path d="M8 13v2" strokeLinecap="round"/>
    </svg>
  );
  const icStop = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="3" width="10" height="10" rx="2"/>
    </svg>
  );
  const icSpeaker = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M3 6H1v4h2l4 3V3L3 6z" strokeLinejoin="round"/>
      <path d="M11 5c1 1 1.5 2 1.5 3S12 11 11 12" strokeLinecap="round"/>
      <path d="M13 3c2 2 2 8 0 10" strokeLinecap="round"/>
    </svg>
  );
  const icSend = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M14 8L2 2l3 6-3 6 12-6z" strokeLinejoin="round"/>
    </svg>
  );
  const icTrash = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M3 5h10M6 5V3h4v2M5 5l1 8h4l1-8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const TEACHER_STARTERS: { id: ChatStarter; label: string }[] = [
    { id: 'contextualize', label: 'Contextualize' },
    { id: 'explain', label: 'Explique' },
    { id: 'ask-question', label: 'Me faça uma pergunta' },
    { id: 'discuss', label: 'Vamos conversar' },
  ];

  const SUGGESTED = [
    'Resuma esta seção como uma nota',
    'Explique com uma analogia',
    'Quais são os conceitos-chave?',
  ];

  const ttsUnavailable = voiceStatus !== null && !voiceStatus.tts;

  return (
    <aside className="chat-panel" ref={chatPanelRef}>
      <header className="chat-panel-header">
        <div className="chat-panel-title-group">
          <span className="chat-avatar" aria-hidden>
            <svg viewBox="0 0 16 16" focusable="false">
              <path
                d="M4 3.5h7.5A1.5 1.5 0 0 1 13 5v8.5H5.5A2.5 2.5 0 0 1 3 11V5.5A2 2 0 0 1 5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 6.5h5M5.5 9h3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div className="ht">
            <div className="chat-panel-title">Parceiro de estudos</div>
          </div>
        </div>
        <button
          type="button"
          className="mini-btn"
          disabled={clearing}
          onClick={() => void clearHistory()}
          title="Limpar histórico"
        >
          {icTrash}
          {clearing ? 'Limpando…' : 'Limpar'}
        </button>
      </header>

      <div className="chat-session-controls" aria-label="Sessões de estudo">
        <select
          aria-label="Sessão de estudo"
          value={sessionId ?? ''}
          disabled={isLoading}
          onChange={(e) => {
            const selected = sessions.find((s) => s.id === e.target.value);
            if (selected) void chooseSession(selected);
          }}
        >
          {!sessionId && <option value="">Nenhuma sessão</option>}
          {sessions.filter((s) => s.status !== 'archived').map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <button type="button" className="mini-btn" disabled={!sessionId || isLoading}
          onClick={() => {
            const selected = sessions.find((s) => s.id === sessionId);
            if (selected) void chooseSession(selected);
          }}>Continuar sessão</button>
        <button type="button" className="mini-btn" disabled={isLoading}
          onClick={() => void newSession()}>Nova sessão</button>
        <button type="button" className="mini-btn" disabled={!sessionId || isLoading}
          onClick={() => void renameSession()}>Renomear</button>
      </div>

      <TutorProfilePanel
        zetelId={zetelId}
        session={sessions.find((item) => item.id === sessionId) ?? null}
        disabled={isLoading}
        onSessionChange={(session) => {
          setSessions((items) => items.map((item) => item.id === session.id ? session : item));
        }}
      />

      <div className="chat-messages" ref={messagesRef} data-testid="chat-messages">
        {!loaded && <p className="chat-placeholder">Carregando histórico…</p>}
        {loaded && visibleMessages.length === 0 && !streaming && (
          <div className="chat-empty">
            <div className="ce-ic">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M12 2a8 8 0 0 1 8 8c0 5-5 10-8 12C9 20 4 17 4 10a8 8 0 0 1 8-8z" strokeLinejoin="round"/>
                <path d="M12 7v5M12 15h.01" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="ce-t">Pergunte sobre o que está lendo</div>
            <div className="ce-s">O parceiro conhece a seção aberta. Peça resumos, analogias ou transforme ideias em notas.</div>
            <div className="suggested">
              {SUGGESTED.map((s) => (
                <button key={s} type="button" onClick={() => void sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleMessages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            <div className="msg-content-wrap">
              {m.role === 'assistant' && <span className="who">Parceiro</span>}
              <div className="msg-bubble" data-testid="msg-bubble" data-role={m.role}>
                {m.role === 'assistant' ? (
                  <FonteText text={m.content} sources={m.meta?.sources} onOpen={onOpenSource} />
                ) : m.content}
              </div>
            </div>
          </div>
        ))}
        {pendingUser && (
          <div className="msg msg-user">
            <div className="msg-content-wrap">
              <div className="msg-bubble" data-role="user-pending">{pendingUser}</div>
            </div>
          </div>
        )}
        {isLoading && !streaming && (
          <div className="msg msg-assistant">
            <div className="msg-content-wrap">
              <span className="who">Parceiro</span>
              <div className="msg-bubble streaming" data-role="thinking">
                <span className="streaming-cursor" aria-hidden />
              </div>
            </div>
          </div>
        )}
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msg-content-wrap">
              <span className="who">Parceiro</span>
              <div className="msg-bubble streaming" data-testid="msg-bubble" data-role="streaming">
                <FonteText text={streaming} sources={turnSources} onOpen={onOpenSource} />
                <span className="streaming-cursor" aria-hidden />
              </div>
            </div>
          </div>
        )}
        {suggestion && (
          <NoteCard
            suggestion={suggestion.data}
            canDiscuss={suggestion.canDiscuss}
            busy={noteBusy || isLoading}
            onSave={(payload) => void saveNote(payload)}
            onDiscuss={discussNote}
            onReject={() => void rejectNote()}
          />
        )}
        {memorySuggestion && (
          <MemoryCard
            suggestion={memorySuggestion.data}
            canDiscuss={memorySuggestion.canDiscuss}
            busy={memoryBusy || isLoading}
            onSave={(titulo, corpo) => void saveMemory(titulo, corpo)}
            onDiscuss={discussMemory}
            onReject={() => void rejectMemory()}
          />
        )}
        {conceptSuggestion && (
          <ConceptCard key={conceptSuggestion.messageId} suggestion={conceptSuggestion}
            busy={conceptBusy || isLoading} onSave={(edit) => void saveConcept(edit)}
            onExplore={exploreConcept} onIgnore={() => void ignoreConcept()} />
        )}
        {error && <p className="feedback err chat-inline-error">{error}</p>}
      </div>

      {toast && <div className="chat-toast">{toast}</div>}

      <div className="teacher-launch">
        <button
          type="button"
          className="mini-btn"
          data-testid="activate-teacher"
          aria-expanded={teacherOpen}
          disabled={isLoading}
          onClick={() => setTeacherOpen((open) => !open)}
        >
          Ativar professora
        </button>
        {teacherOpen && (
          <div className="teacher-starters" role="group" aria-label="Como a professora começa">
            {TEACHER_STARTERS.map((choice) => (
              <button
                key={choice.id}
                type="button"
                data-testid={`starter-${choice.id}`}
                disabled={isLoading}
                onClick={() => void sendMessage(undefined, choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="composer">
        {pdfSelectionText && (
          <div className="composer-selection" data-testid="pdf-selection-chip">
            <span className="composer-selection-label">
              Trecho selecionado (p. {pdfFocus?.pageNumber}):
            </span>
            <span className="composer-selection-text" title={pdfSelectionText}>
              {pdfSelectionText}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onClearPdfSelection?.()}
              disabled={isLoading}
              aria-label="Remover trecho selecionado"
            >
              ✕
            </button>
          </div>
        )}
        <div className="composer-box">
          <textarea
            ref={inputRef}
            className="chat-input composer-input"
            rows={2}
            placeholder={micAtivo ? 'Ouvindo…' : 'Pergunte sobre esta página…'}
            value={input}
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="composer-bar">
            {/* Toggle MIC — sempre visível */}
            <button
              type="button"
              data-testid="mic-toggle"
              className={`mic-btn${micAtivo ? ' active' : ''}${voiceState === 'listening' ? ' rec' : ''}`}
              onClick={toggleMic}
              title={micAtivo ? 'Desligar microfone' : 'Ligar microfone (Web Speech API)'}
              aria-label={micAtivo ? 'Desligar microfone' : 'Ligar microfone'}
              aria-pressed={micAtivo}
            >
              {voiceState === 'listening' ? icStop : icMic}
            </button>

            {/* Toggle AUTO-PLAY — sempre visível; disabled quando TTS indisponível */}
            <button
              type="button"
              data-testid="autoplay-toggle"
              className={`mic-btn${autoPlay ? ' active' : ''}`}
              onClick={toggleAutoPlay}
              disabled={ttsUnavailable}
              title={
                ttsUnavailable
                  ? 'Auto-play indisponível — configure a chave TTS nas Configurações'
                  : autoPlay
                  ? 'Desligar auto-play de voz'
                  : 'Ligar auto-play de voz'
              }
              aria-label={autoPlay ? 'Desligar auto-play de voz' : 'Ligar auto-play de voz'}
              aria-pressed={autoPlay}
            >
              {icSpeaker}
            </button>

            <div className="grow" />

            <span
              className="voice-status"
              role="status"
              aria-live="polite"
              data-testid="voice-status"
              data-state={voiceState}
            >
              {VOICE_STATE_LABEL[voiceState]}
            </span>

            {(voiceState === 'thinking' || voiceState === 'speaking') && (
              <button
                type="button"
                className="stop-turn-btn"
                data-testid="stop-turn"
                onClick={stopPartner}
                title="Parar"
                aria-label="Parar"
              >
                ■ Parar
              </button>
            )}

            <button
              type="button"
              className="send-btn"
              disabled={isLoading || !input.trim()}
              onClick={() => void sendMessage()}
            >
              {isLoading ? <span className="streaming-cursor" aria-hidden /> : icSend}
              {!isLoading && 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
