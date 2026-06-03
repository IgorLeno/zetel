'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/chat-message';
import { NoteCard, type Suggestion } from './NoteCard';
import { MemoryCard, type MemorySuggestionData } from './MemoryCard';

type ReadingMode = 'tecnico' | 'guia-estudo';
type VoiceState = 'idle' | 'listening' | 'speaking';

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
  error: string | null;
  done: boolean;
} {
  const chunks: string[] = [];
  let suggestion: Suggestion | null = null;
  let memorySuggestion: MemorySuggestionData | null = null;
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

  return { chunks, suggestion, memorySuggestion, error, done };
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
}: {
  zetelId: string;
  currentReadingMode: ReadingMode;
  currentPageIndex: number | null;
  currentGuideBlockId: string | null;
  currentGuideSectionId: string | null;
  currentGuideBlockTitle: string | null;
  currentGuideBlockIndex: number | null;
  currentGuideBlockTotal: number | null;
}) {
  // ── Core chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
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
  const [noteBusy, setNoteBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // ── Voice UI state ───────────────────────────────────────────────────────────
  // Default false para evitar mismatch SSR; localStorage é lido no useEffect.
  const [voiceStatus, setVoiceStatus] = useState<{ tts: boolean; stt: boolean } | null>(null);
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  // Container do painel — usado para o listener de gesto que inicia o mic pendente.
  const chatPanelRef = useRef<HTMLElement>(null);

  const discussNextRef = useRef(false);
  const discussNextMemoryRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // ── Carrega histórico ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/zetels/${zetelId}/chat`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setMessages(data.messages ?? []);
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
  }, [zetelId]);

  // ── Verifica disponibilidade de voz ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/voice/status');
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { tts: boolean; stt: boolean };
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

  // ── Degradação silenciosa: se chave sumiu, desliga os modos que dependem dela ──
  useEffect(() => {
    if (!voiceStatus) return;
    let changed = false;
    if (micAtivoRef.current && !voiceStatus.stt) {
      micAtivoRef.current = false;
      setMicAtivo(false);
      changed = true;
    }
    if (autoPlayRef.current && !voiceStatus.tts) {
      autoPlayRef.current = false;
      setAutoPlay(false);
      changed = true;
    }
    if (changed) saveVoicePrefs(micAtivoRef.current, autoPlayRef.current);
  }, [voiceStatus]);

  // ── Listener one-time: inicia mic pendente no primeiro gesto do usuário ──────
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
      if (audioRef.current) audioRef.current.pause();
      if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
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
  }, [messages, streaming, suggestion, memorySuggestion, scrollToBottom]);

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
          voiceStateRef.current = 'idle';
          setVoiceState('idle');
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
    setInput(text);  // exibe transcrição no textarea
    void sendMessage(text); // passa texto direto para evitar race com setInput assíncrono
  }

  function maybeRestartMic(): void {
    if (micAtivoRef.current && !isLoadingRef.current) {
      startListening();
    }
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
    if (!next) stopCurrentAudio();
  }

  // ── TTS (mecanismo M13 mantido; adiciona maybeRestartMic ao terminar) ────────

  function stopCurrentAudio(): void {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current); // D33
      currentAudioUrlRef.current = null;
    }
    if (voiceStateRef.current === 'speaking') {
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
    }
  }

  async function playTts(text: string): Promise<void> {
    stopCurrentAudio(); // D42: interrompe reprodução anterior
    voiceStateRef.current = 'speaking';
    setVoiceState('speaking');

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`TTS ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentAudioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      const handlePlaybackError = () => {
        if (currentAudioUrlRef.current === url) {
          URL.revokeObjectURL(url); // D33
          currentAudioUrlRef.current = null;
        }
        audioRef.current = null;
        voiceStateRef.current = 'idle';
        setVoiceState('idle');
        // D41: fallback textual garantido — texto já está no chat
        maybeRestartMic(); // reinicia mic para o próximo turno
      };

      audio.onended = () => {
        if (currentAudioUrlRef.current !== url) return;
        URL.revokeObjectURL(url); // D33
        currentAudioUrlRef.current = null;
        audioRef.current = null;
        voiceStateRef.current = 'idle';
        setVoiceState('idle');
        maybeRestartMic(); // loop mãos-livres: mic reativa após reprodução
      };

      audio.onerror = () => {
        handlePlaybackError();
      };

      void audio.play().catch(() => {
        handlePlaybackError();
      });
    } catch {
      // D41: TTS falhou — texto já visível no chat
      voiceStateRef.current = 'idle';
      setVoiceState('idle');
      maybeRestartMic();
    }
  }

  // ── Chat functions ───────────────────────────────────────────────────────────

  async function clearHistory() {
    if (!confirm('Apagar todo o histórico deste Zetel?')) return;
    setError(null);
    setClearing(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat`, { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        setStreaming('');
        setSuggestion(null);
        setMemorySuggestion(null);
      }
    } catch {
      setError('Falha ao limpar o histórico.');
    } finally {
      setClearing(false);
    }
  }

  // textOverride: passado diretamente do fluxo de voz e de "Discutir" para evitar
  // race condition com setInput assíncrono (não lê o estado input nesses caminhos).
  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isLoading) return;

    // D36: interactionMode derivado de autoPlay — estilo oral no backend quando autoPlay=ON
    const mode: 'text' | 'voice' = autoPlayRef.current ? 'voice' : 'text';

    if (textOverride === undefined) setInput('');
    setError(null);
    isLoadingRef.current = true;
    setIsLoading(true);
    setStreaming('');
    setSuggestion(null);
    setMemorySuggestion(null);

    let received: Suggestion | null = null;
    let receivedMemory: MemorySuggestionData | null = null;
    let willPlayAudio = false;

    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: text,
          pageIndex: currentPageIndex,
          readingMode: currentReadingMode,
          guideBlockId: currentGuideBlockId,
          guideSectionId: currentGuideSectionId,
          guideBlockTitle: currentGuideBlockTitle,
          guideBlockIndex: currentGuideBlockIndex,
          guideBlockTotal: currentGuideBlockTotal,
          interactionMode: mode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha ao enviar mensagem.');
        isLoadingRef.current = false;
        setIsLoading(false);
        return;
      }

      if (!res.body) {
        setError('Resposta sem stream.');
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
        if (parsed.done) return;
        for (const c of parsed.chunks) {
          accumulated += c;
          setStreaming(accumulated);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const boundary = sseBuffer.lastIndexOf('\n');
        if (boundary === -1) continue;
        flush(sseBuffer.slice(0, boundary + 1));
        sseBuffer = sseBuffer.slice(boundary + 1);
      }
      if (sseBuffer.trim()) flush(sseBuffer);

      setStreaming('');

      if (streamError) {
        setError(streamError);
      } else if (!accumulated.trim() && !received && !receivedMemory) {
        setError('O parceiro encerrou a resposta sem conteúdo visível. Tente novamente.');
      } else {
        const histRes = await fetch(`/api/zetels/${zetelId}/chat`);
        const histData = await histRes.json();
        if (histRes.ok) setMessages(histData.messages ?? []);
        if (received) {
          setSuggestion({ data: received, canDiscuss: !discussNextRef.current });
        }
        if (receivedMemory) {
          setMemorySuggestion({
            data: receivedMemory,
            canDiscuss: !discussNextMemoryRef.current,
          });
        }
        // D36: TTS automático apenas quando autoPlay=ON
        if (mode === 'voice' && accumulated.trim()) {
          willPlayAudio = true;
          void playTts(accumulated);
        }
      }
    } catch {
      setError('Erro de rede ao conversar com o parceiro.');
      setStreaming('');
    } finally {
      discussNextRef.current = false;
      discussNextMemoryRef.current = false;
      isLoadingRef.current = false;
      setIsLoading(false);
      inputRef.current?.focus();
      // Se TTS vai tocar, ele chama maybeRestartMic ao terminar (loop mãos-livres).
      // Caso contrário, reinicia o mic agora.
      if (!willPlayAudio) {
        maybeRestartMic();
      }
    }
  }

  async function saveNote(corpoFinal: string) {
    if (!suggestion) return;
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: suggestion.data.tipo,
          titulo: suggestion.data.titulo,
          corpo: corpoFinal,
          paginaOrigem: suggestion.data.paginaOrigem,
          modelo: suggestion.data.model,
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
        body: JSON.stringify({ messageId, rejected: true }),
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
        body: JSON.stringify({ messageId, rejected: true, kind: 'memory' }),
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

  const sectionLabel = currentGuideBlockTitle
    ? currentGuideBlockTitle
    : currentPageIndex !== null
    ? `Página ${currentPageIndex + 1}`
    : 'página atual';

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
            <div className="chat-head-sub">{sectionLabel}</div>
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

      {/* Context chip — shows what the partner is reading */}
      <div className="context-chip">
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" strokeLinejoin="round"/>
          <path d="M5 6h6M5 9h4" strokeLinecap="round"/>
        </svg>
        Lendo · <b>{sectionLabel}</b>
      </div>

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
                {m.content}
              </div>
            </div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msg-content-wrap">
              <span className="who">Parceiro</span>
              <div className="msg-bubble streaming" data-testid="msg-bubble" data-role="streaming">
                {streaming}
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
            onSave={(corpo) => void saveNote(corpo)}
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
        {error && <p className="feedback err chat-inline-error">{error}</p>}
      </div>

      {toast && <div className="chat-toast">{toast}</div>}

      {/* Composer */}
      <div className="composer">
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

            {/* Botão de parar TTS — visível apenas durante reprodução */}
            {voiceState === 'speaking' && (
              <button
                type="button"
                className="mic-btn rec"
                onClick={stopCurrentAudio}
                title="Parar reprodução"
                aria-label="Parar reprodução"
              >
                {icStop}
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
