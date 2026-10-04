'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatMessage, CitedSource } from '@/types/chat-message';
import type { StudySession } from '@/types/study-session';
import { toSpeakable } from '@/lib/speech-text';
import { starterCanonical, type ChatStarter } from '@/lib/chat-starters';
import {
  insecureContextMicMessage,
  speechRecognitionErrorMessage,
} from '@/lib/speech-recognition-error';
import { FonteText } from './FonteText';
import { NoteCard, type Suggestion, type SaveNotePayload } from './NoteCard';
import { MemoryCard, type MemorySuggestionData } from './MemoryCard';
import { ConceptCard, type ConceptSuggestionData } from './ConceptCard';
import { PartnerOrb, type OrbState } from './PartnerOrb';
import { PartnerSheet } from './PartnerSheet';
import { PartnerStudio, resolvePartner, useTutorProfiles } from './PartnerStudio';
import { partnerColorVar, partnerTagline, type PartnerColor } from '@/lib/partner-identity';
import { useTtsQueue, extractSentences } from '@/hooks/useTtsQueue';
import { useBargeIn } from '@/hooks/useBargeIn';
import { shouldArmBargeIn } from '@/lib/barge-in';
import { readUiPref, writeUiPref, VOICE_PREFS } from '@/lib/ui-prefs';

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

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Cookie (não localStorage): vale em qualquer porta do localhost (SPEC-008).
// bargeIn omitido preserva o valor salvo: os toggles de mic/voz não o apagam.
function saveVoicePrefs(micAtivo: boolean, autoPlay: boolean, bargeIn?: boolean): void {
  const keep = bargeIn ?? readUiPref(VOICE_PREFS).bargeIn;
  writeUiPref(VOICE_PREFS, { micAtivo, autoPlay, bargeIn: keep });
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
  onPartnerColorChange,
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
  /** Cor do parceiro atual, para o resto da tela de estudo acompanhar. */
  onPartnerColorChange?: (color: PartnerColor | null) => void;
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
  const initialSessionPromise = useRef<Promise<StudySession> | null>(null);
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
  const [partnerOpen, setPartnerOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const { profiles, setProfiles } = useTutorProfiles();

  // ── Voice UI state ───────────────────────────────────────────────────────────
  // Default false para evitar mismatch SSR; localStorage é lido no useEffect.
  const [voiceStatus, setVoiceStatus] = useState<{ tts: boolean; sttServer: boolean } | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [micAtivo, setMicAtivo] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [bargeIn, setBargeIn] = useState(true);

  // ── Refs (leitura síncrona em callbacks assíncronos) ─────────────────────────
  const micAtivoRef = useRef(false);
  const autoPlayRef = useRef(false);
  const bargeInRef = useRef(true);
  // Aviso de mic bloqueado para o barge-in aparece uma vez, não a cada turno.
  const bargeInErrorShownRef = useRef(false);
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

  // Barge-in (SPEC-003): fala do usuário durante pensando/falando = Parar + ouvir.
  useBargeIn({
    armed: shouldArmBargeIn({ enabled: bargeIn, micAtivo, autoPlay, voiceState }),
    speaking: voiceState === 'speaking',
    onBargeIn: interruptByVoice,
    onError: () => {
      if (bargeInErrorShownRef.current) return;
      bargeInErrorShownRef.current = true;
      showToast('Interrupção por fala indisponível: o microfone não abriu.');
    },
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
          // O efeito pode ser repetido antes do POST terminar (React Strict Mode).
          // Compartilhar a promessa impede duas sessões para a mesma entrada.
          if (!initialSessionPromise.current) {
            const focus = pdfFocusRef.current;
            initialSessionPromise.current = (async () => {
              const created = await fetch(`/api/zetels/${zetelId}/sessions`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ focus: focus
                  ? { scope: 'page', fileId: focus.fileId, pageNumber: focus.pageNumber } : null }),
              });
              if (!created.ok) throw new Error('create session');
              return (await created.json() as { session: StudySession }).session;
            })();
          }
          selected = await initialSessionPromise.current;
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

  // ── Restaura prefs do cookie (apenas estado visual; mic não inicia agora) ──
  useEffect(() => {
    const prefs = readUiPref(VOICE_PREFS);
    setMicAtivo(prefs.micAtivo);
    setAutoPlay(prefs.autoPlay);
    micAtivoRef.current = prefs.micAtivo;
    autoPlayRef.current = prefs.autoPlay;
    setBargeIn(prefs.bargeIn);
    bargeInRef.current = prefs.bargeIn;
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

  // ── Menu "mais": fecha ao clicar fora ou com Escape ──────────────────────────
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const menu = moreRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.removeAttribute('open');
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') moreRef.current?.removeAttribute('open');
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
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
    if (!window.isSecureContext) {
      disableMicWithError(insecureContextMicMessage(window.location.href));
      return;
    }

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
        const message = speechRecognitionErrorMessage(event.error);
        // no-speech e aborted são benignos; onend trata o reinício
        if (!message) return;
        disableMicWithError(message);
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
      // Sem setError(null): o reinício automático após um turno falho apagaria o erro do chat.
    } catch {
      // start() pode lançar se browser rejeitar (e.g., já está rodando)
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
    }
  }

  /** Erro fatal desliga o mic; senão onend reiniciaria em laço contra o mesmo erro. */
  function disableMicWithError(message: string): void {
    micAtivoRef.current = false;
    setMicAtivo(false);
    pendingMicStartRef.current = false;
    saveVoicePrefs(false, autoPlayRef.current);
    setError(message);
    voiceStateRef.current = 'error';
    setVoiceState('error');
  }

  function handleFinalTranscript(text: string): void {
    stopListening(); // para a captura durante o processamento
    setInput('');
    void sendMessage(text); // textOverride: evita race com setInput e mantém textarea limpo
  }

  function maybeRestartMic(): void {
    // Barge-in já reabriu a escuta: reiniciar agora abortaria a fala em captura.
    if (voiceStateRef.current === 'listening' && recognitionRef.current) return;
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

  /** Mesma semântica de Parar; a escuta volta já, sem esperar o stream fechar. */
  function interruptByVoice(): void {
    if (!micAtivoRef.current) return;
    stopPartner();
    if (voiceStateRef.current !== 'listening') startListening();
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
      setError(null); // religar pelo botão limpa o erro de mic anterior
      startListening();
    } else {
      stopListening();
    }
  }

  function toggleBargeIn(): void {
    const next = !bargeInRef.current;
    bargeInRef.current = next;
    setBargeIn(next);
    saveVoicePrefs(micAtivoRef.current, autoPlayRef.current, next);
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
    // Ref, não estado: o reconhecimento reaberto pelo barge-in guarda o closure
    // de um render em que isLoading ainda era true.
    if (isLoadingRef.current || !text) return;

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
  // Balão de fala; desligado ganha um traço diagonal.
  const icBargeIn = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M2 3h12v8H7l-3 3v-3H2z" strokeLinejoin="round"/>
      {!bargeIn && <path d="M2 14L14 2" strokeLinecap="round"/>}
    </svg>
  );
  const icSend = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M14 8L2 2l3 6-3 6 12-6z" strokeLinejoin="round"/>
    </svg>
  );
  const icNote = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M4 2h6l3 3v9H4z" strokeLinejoin="round"/>
      <path d="M6.5 8h4M6.5 10.5h3" strokeLinecap="round"/>
    </svg>
  );
  const icRedo = (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M13 4v3h-3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12.6 7A5 5 0 1 0 13 10" strokeLinecap="round"/>
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

  const QUICK_PROMPTS = [
    'Me dá uma analogia',
    'Resuma como nota',
    'Quais são os conceitos-chave?',
  ];

  const ttsUnavailable = voiceStatus !== null && !voiceStatus.tts;
  const currentSession = sessions.find((item) => item.id === sessionId) ?? null;
  const partner = resolvePartner(profiles, currentSession);
  const partnerName = partner?.name ?? 'Parceiro';
  const partnerStyle = partner ? ({ '--p': partnerColorVar(partner.color) } as CSSProperties) : undefined;
  const orbState: OrbState = voiceState === 'listening' ? 'listening'
    : voiceState === 'speaking' || (streaming && isLoading) ? 'speaking'
      : isLoading || voiceState === 'thinking' ? 'thinking' : 'idle';
  const lastAssistantId = [...visibleMessages].reverse().find((m) => m.role === 'assistant')?.id ?? null;

  function speak(text: string) {
    if (!voiceStatus?.tts) {
      setError('Voz indisponível. Configure a chave TTS nas Configurações.');
      return;
    }
    tts.beginTurn();
    const { sentences, rest } = extractSentences(toSpeakable(text));
    for (const sentence of sentences) tts.enqueue(sentence);
    if (rest.trim()) tts.enqueue(rest.trim());
    tts.seal();
  }

  const composerLocked = isLoading || !loaded;
  const partnerColor = partner?.color ?? null;
  useEffect(() => { onPartnerColorChange?.(partnerColor); }, [partnerColor, onPartnerColorChange]);

  return (
    <section className="chat-panel" ref={chatPanelRef} style={partnerStyle} aria-label={`Conversa com ${partnerName}`}>
      <header className="chat-panel-header">
        <button type="button" className="partner-switch" disabled={!partner}
          aria-label={`Parceiro: ${partnerName}. Trocar ou ajustar`} aria-haspopup="dialog"
          onClick={() => setPartnerOpen(true)}>
          <PartnerOrb color={partner?.color} size={26} face={false} state={orbState} />
          <span className="partner-switch-name">{partnerName}</span>
          <svg viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {currentSession && (
          <span className="chat-session-name" title={currentSession.title}>{currentSession.title}</span>
        )}
        <details className="chat-more" ref={moreRef}
          onClick={(event) => {
            // Fecha o menu depois de qualquer ação (o <select> precisa continuar aberto).
            if ((event.target as HTMLElement).closest('.chat-more-menu button')) moreRef.current?.removeAttribute('open');
          }}>
          <summary aria-label="Mais opções da conversa" title="Mais opções">
            <svg viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>
          </summary>
          <div className="chat-more-menu">
            <label className="chat-more-label" htmlFor="study-session-select">Sessão atual</label>
            <select id="study-session-select" aria-label="Sessão de estudo"
              value={sessionId ?? ''} disabled={isLoading}
              onChange={(e) => {
                const selected = sessions.find((s) => s.id === e.target.value);
                if (selected) void chooseSession(selected);
              }}>
              {!sessionId && <option value="">Nenhuma sessão</option>}
              {sessions.filter((s) => s.status !== 'archived').map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <button type="button" disabled={!sessionId || isLoading} onClick={() => {
              if (currentSession) void chooseSession(currentSession);
            }}>Continuar sessão</button>
            <button type="button" disabled={isLoading} onClick={() => void newSession()}>Nova sessão</button>
            <button type="button" disabled={!sessionId || isLoading} onClick={() => void renameSession()}>Renomear sessão</button>
            <div className="chat-more-divider" />
            <button type="button" data-testid="autoplay-toggle" disabled={ttsUnavailable}
              aria-pressed={autoPlay} onClick={toggleAutoPlay}>
              {icSpeaker} {autoPlay ? 'Desligar voz automática' : 'Ligar voz automática'}
            </button>
            <button type="button" disabled={clearing || !sessionId} onClick={() => void clearHistory()}>
              {icTrash} {clearing ? 'Limpando…' : 'Limpar histórico'}
            </button>
          </div>
        </details>
      </header>

      <div className="chat-messages" ref={messagesRef} data-testid="chat-messages">
        <div className="chat-stream">
          {!loaded && <p className="chat-placeholder">Carregando conversa…</p>}
          {loaded && visibleMessages.length === 0 && !streaming && !pendingUser && (
            <div className="chat-empty">
              <PartnerOrb color={partner?.color} size={104} state={orbState} />
              <div className="ce-t">{partnerName}</div>
              <div className="ce-s">
                {partner ? partnerTagline(partner) : 'Seu parceiro de estudos'}. Eu conheço a parte que você está lendo —
                escolha como começamos ou me pergunte qualquer coisa.
              </div>
              <div className="teacher-starters" role="group" aria-label={`Como ${partnerName} começa`}>
                {TEACHER_STARTERS.map((choice) => (
                  <button key={choice.id} type="button" data-testid={`starter-${choice.id}`}
                    disabled={composerLocked} onClick={() => void sendMessage(undefined, choice.id)}>
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {visibleMessages.map((m) => (
            <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
              {m.role === 'assistant' && <PartnerOrb color={partner?.color} size={32} />}
              <div className="msg-content-wrap">
                <div className="msg-bubble" data-testid="msg-bubble" data-role={m.role}>
                  {m.role === 'assistant' ? (
                    <FonteText text={m.content} sources={m.meta?.sources} onOpen={onOpenSource} />
                  ) : m.content}
                </div>
                {m.role === 'assistant' && (
                  <div className="msg-actions">
                    <button type="button" disabled={ttsUnavailable} title={ttsUnavailable ? 'Configure a voz nas Configurações' : undefined}
                      onClick={() => speak(m.content)}>{icSpeaker} Ouvir</button>
                    {m.id === lastAssistantId && (
                      <>
                        <button type="button" disabled={composerLocked}
                          onClick={() => void sendMessage('Transforme sua última explicação em uma nota.')}>
                          {icNote} Virar nota
                        </button>
                        <button type="button" disabled={composerLocked}
                          onClick={() => void sendMessage('Explique isso de outro jeito, mais simples.')}>
                          {icRedo} Outra explicação
                        </button>
                      </>
                    )}
                  </div>
                )}
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
              <PartnerOrb color={partner?.color} size={32} state="thinking" />
              <div className="msg-content-wrap">
                <div className="msg-bubble streaming" data-role="thinking">
                  <span className="typing-dots" aria-label={`${partnerName} está pensando`}><i /><i /><i /></span>
                </div>
              </div>
            </div>
          )}
          {streaming && (
            <div className="msg msg-assistant">
              <PartnerOrb color={partner?.color} size={32} state="speaking" />
              <div className="msg-content-wrap">
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
          {error && <p className="feedback err chat-inline-error" role="alert">{error}</p>}
        </div>
      </div>

      {toast && <div className="chat-toast" role="status">{toast}</div>}

      {/* Composer */}
      <div className="composer">
        {visibleMessages.length > 0 && (
          <div className="quick-actions" role="group" aria-label="Atalhos da conversa">
            {TEACHER_STARTERS.map((choice) => (
              <button key={choice.id} type="button" data-testid={`quick-starter-${choice.id}`}
                disabled={composerLocked} onClick={() => void sendMessage(undefined, choice.id)}>
                {choice.label}
              </button>
            ))}
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" disabled={composerLocked} onClick={() => void sendMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}
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
            rows={1}
            placeholder={micAtivo ? 'Estou ouvindo… pode falar' : `Fale ou escreva para ${partnerName}…`}
            value={input}
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="composer-bar">
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
                {icStop} Parar
              </button>
            )}

            <button
              type="button"
              className="send-btn"
              aria-label="Enviar"
              disabled={isLoading || !input.trim()}
              onClick={() => void sendMessage()}
            >
              {icSend}
            </button>

            {/* Toggle MIC — sempre visível */}
            <button
              type="button"
              data-testid="mic-toggle"
              className={`mic-btn${micAtivo ? ' active' : ''}${voiceState === 'listening' ? ' rec' : ''}`}
              onClick={toggleMic}
              title={micAtivo ? 'Desligar microfone' : 'Falar (microfone)'}
              aria-label={micAtivo ? 'Desligar microfone' : 'Ligar microfone'}
              aria-pressed={micAtivo}
            >
              {voiceState === 'listening' ? icStop : icMic}
            </button>

            {/* Barge-in só age com o mic ligado; desligar o mic já o desativa */}
            {micAtivo && (
              <button
                type="button"
                data-testid="barge-in-toggle"
                className="send-btn"
                disabled={!autoPlay}
                onClick={toggleBargeIn}
                title={!autoPlay
                  ? 'Interromper ao falar exige voz automática'
                  : bargeIn ? 'Interromper ao falar: ligado' : 'Interromper ao falar: desligado'}
                aria-label="Interromper a parceira ao falar"
                aria-pressed={bargeIn}
              >
                {icBargeIn}
              </button>
            )}
          </div>
        </div>
      </div>

      {partnerOpen && (
        <PartnerSheet onClose={() => setPartnerOpen(false)} title="Com quem você quer estudar?">
          <PartnerStudio
            profiles={profiles}
            setProfiles={setProfiles}
            session={currentSession}
            zetelId={zetelId}
            disabled={isLoading}
            onSessionChange={(session) => {
              setSessions((items) => items.map((item) => item.id === session.id ? session : item));
            }}
          />
          {!currentSession && <p className="field-hint">Mande a primeira mensagem para abrir uma sessão e escolher o parceiro dela.</p>}
        </PartnerSheet>
      )}
    </section>
  );
}
