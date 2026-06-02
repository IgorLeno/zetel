'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/chat-message';
import { NoteCard, type Suggestion } from './NoteCard';
import { MemoryCard, type MemorySuggestionData } from './MemoryCard';

type ReadingMode = 'tecnico' | 'guia-estudo';
type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking';

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
        /* sugestão malformada — ignora, segue como resposta normal */
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestion, setSuggestion] = useState<{ data: Suggestion; canDiscuss: boolean } | null>(null);
  const [memorySuggestion, setMemorySuggestion] = useState<{
    data: MemorySuggestionData;
    canDiscuss: boolean;
  } | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Voice UI (Módulo 13.3)
  const [voiceStatus, setVoiceStatus] = useState<{ tts: boolean; stt: boolean } | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [ttsErrorIds, setTtsErrorIds] = useState<Set<string>>(new Set());
  const [recordSecondsLeft, setRecordSecondsLeft] = useState<number | null>(null);

  const visibleMessages = messages.filter(
    (m) => !(m.role === 'assistant' && m.content.trim().length === 0),
  );

  // Quando true, a PRÓXIMA sugestão recebida vem sem "Discutir" (bounded — regra #10).
  const discussNextRef = useRef(false);
  const discussNextMemoryRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice refs (D33/D38/D42)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const isAutoVoiceRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Load chat history
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

  // Fetch voice availability once on mount
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
        /* voice indisponível — controles ocultos (D41) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup audio/recording resources on unmount (D33/D38)
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((t) => t.stop());
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

  // ── Voice functions ──────────────────────────────────────────────────────────

  function stopCurrentAudio(): void {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setPlayingMsgId(null);
    // If auto-voice TTS was playing, reset voice state (D42)
    if (isAutoVoiceRef.current) {
      isAutoVoiceRef.current = false;
      setVoiceState('idle');
    }
  }

  async function playTts(
    text: string,
    opts: { msgId?: string; isAutoVoice?: boolean } = {},
  ): Promise<void> {
    const { msgId, isAutoVoice = false } = opts;

    stopCurrentAudio();

    if (msgId) setPlayingMsgId(msgId);
    if (isAutoVoice) {
      isAutoVoiceRef.current = true;
      setVoiceState('speaking');
    }

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

      const handlePlaybackError = (err?: unknown) => {
        if (currentAudioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          currentAudioUrlRef.current = null;
        }
        audioRef.current = null;
        if (msgId) {
          setPlayingMsgId(null);
          setTtsErrorIds((prev) => new Set([...prev, msgId]));
        }
        if (isAutoVoice) {
          isAutoVoiceRef.current = false;
          setVoiceState('idle');
        }
        if (err) {
          console.warn('[voice] Falha ao reproduzir áudio TTS', err);
        }
      };

      audio.onended = () => {
        if (currentAudioUrlRef.current !== url) return;
        URL.revokeObjectURL(url);
        currentAudioUrlRef.current = null;
        audioRef.current = null;
        if (msgId) setPlayingMsgId(null);
        if (isAutoVoice) {
          isAutoVoiceRef.current = false;
          setVoiceState('idle');
        }
      };

      audio.onerror = () => {
        handlePlaybackError();
      };

      // Start playback — rejection is explicit (autoplay/policy) and must cleanup UI state.
      void audio.play().catch((err) => {
        handlePlaybackError(err);
      });
    } catch {
      if (msgId) {
        setPlayingMsgId(null);
        setTtsErrorIds((prev) => new Set([...prev, msgId]));
      }
      if (isAutoVoice) {
        isAutoVoiceRef.current = false;
        setVoiceState('idle');
      }
    }
  }

  async function startRecording(): Promise<void> {
    stopCurrentAudio();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Não foi possível acessar o microfone.');
      return;
    }

    recordStreamRef.current = stream;

    const mimeType =
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4';

    const recorder = new MediaRecorder(stream, { mimeType });
    audioChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;
      void handleRecordingStop(mimeType);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setVoiceState('listening');
    setError(null);

    // Auto-stop after 120s; countdown in last 10s (D34)
    let elapsed = 0;
    recordTimerRef.current = setInterval(() => {
      elapsed++;
      const remaining = 120 - elapsed;
      if (remaining <= 10) setRecordSecondsLeft(remaining);
      if (remaining <= 0) {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
        stopRecording();
      }
    }, 1000);
  }

  function stopRecording(): void {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecordSecondsLeft(null);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      mediaRecorderRef.current = null;
    }
  }

  async function handleRecordingStop(mimeType: string): Promise<void> {
    setVoiceState('transcribing');

    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];

    if (chunks.length === 0) {
      setVoiceState('idle');
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `recording.${ext}`, { type: mimeType });
    const form = new FormData();
    form.append('audio', file);

    try {
      const res = await fetch('/api/voice/stt', { method: 'POST', body: form });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setVoiceState('idle');
        setError(data.error ?? 'Erro ao transcrever o áudio.');
        return;
      }

      const data = (await res.json()) as { text?: string };
      const text = data.text?.trim() ?? '';

      if (!text) {
        setVoiceState('idle');
        setError('Não foi possível transcrever. Tente novamente.');
        return;
      }

      // D40: transcrição visível no textarea antes do envio
      setInput(text);
      setVoiceState('idle');

      // Auto-send with voice interaction mode (D36)
      void sendMessage(text, 'voice');
    } catch {
      setVoiceState('idle');
      setError('Erro ao transcrever o áudio.');
    }
  }

  function handleMicClick(): void {
    if (voiceState === 'idle') {
      void startRecording();
    } else if (voiceState === 'listening') {
      stopRecording();
    }
    // transcribing/speaking: button is disabled — no action
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

  async function sendMessage(rawText?: string, mode: 'text' | 'voice' = 'text') {
    const text = (rawText ?? input).trim();
    if (!text || isLoading) return;

    if (rawText === undefined) setInput('');
    setError(null);
    setIsLoading(true);
    setStreaming('');
    setSuggestion(null);
    setMemorySuggestion(null);

    let received: Suggestion | null = null;
    let receivedMemory: MemorySuggestionData | null = null;

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
        setIsLoading(false);
        return;
      }

      if (!res.body) {
        setError('Resposta sem stream.');
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let streamError: string | null = null;
      // Buffer acumulador: uma linha `data:` pode chegar partida entre dois
      // chunks do ReadableStream. Só processamos linhas completas (até o último
      // `\n`); o resto fica retido para o próximo chunk.
      let sseBuffer = '';

      const flush = (text: string) => {
        const parsed = parseSseChunk(text);
        if (parsed.error) streamError = parsed.error;
        if (parsed.suggestion) received = parsed.suggestion;
        if (parsed.memorySuggestion) receivedMemory = parsed.memorySuggestion;
        if (parsed.done) return; // stream encerrado via [DONE] — não processar mais chunks
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
      // Processa qualquer resto sem `\n` final ao terminar o stream.
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
        // D36: TTS automático apenas quando modo conversa está ativo
        if (mode === 'voice' && accumulated.trim()) {
          void playTts(accumulated, { isAutoVoice: true });
        }
      }
    } catch {
      setError('Erro de rede ao conversar com o parceiro.');
      setStreaming('');
    } finally {
      discussNextRef.current = false;
      discussNextMemoryRef.current = false;
      setIsLoading(false);
      inputRef.current?.focus();
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
      /* a flag é só para auditoria; falha não bloqueia o usuário */
    }
    showToast('Sugestão descartada.');
  }

  function discussNote() {
    if (!suggestion) return;
    const { titulo, corpo } = suggestion.data;
    discussNextRef.current = true; // a próxima sugestão volta sem "Discutir"
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
      /* a flag é só para auditoria; falha não bloqueia o usuário */
    }
    showToast('Memória rejeitada.');
  }

  function discussMemory() {
    if (!memorySuggestion) return;
    const { titulo, corpo } = memorySuggestion.data;
    discussNextMemoryRef.current = true; // a próxima sugestão volta sem "Discutir"
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

  const micDisabled = voiceState === 'transcribing' || voiceState === 'speaking' || isLoading;
  const inputDisabled = isLoading || voiceState !== 'idle';

  return (
    <aside className="chat-panel">
      <header className="chat-panel-header">
        <span className="chat-panel-title">Parceiro de estudos</span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={clearing}
          onClick={() => void clearHistory()}
        >
          {clearing ? 'Limpando…' : 'Limpar'}
        </button>
      </header>

      <div className="chat-messages" ref={messagesRef} data-testid="chat-messages">
        {!loaded && <p className="chat-placeholder">Carregando histórico…</p>}
        {loaded && visibleMessages.length === 0 && !streaming && (
          <p className="chat-placeholder">Pergunte sobre a página atual.</p>
        )}
        {visibleMessages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            <div className="msg-content-wrap">
              <div className="msg-bubble" data-testid="msg-bubble" data-role={m.role}>
                {m.content}
              </div>
              {m.role === 'assistant' && voiceStatus?.tts && (
                <button
                  type="button"
                  className={`chat-tts-btn${ttsErrorIds.has(m.id) ? ' chat-tts-error' : ''}${playingMsgId === m.id ? ' playing' : ''}`}
                  title={
                    playingMsgId === m.id
                      ? 'Parar reprodução'
                      : ttsErrorIds.has(m.id)
                        ? 'Tentar novamente'
                        : 'Ouvir resposta'
                  }
                  disabled={playingMsgId !== null && playingMsgId !== m.id}
                  onClick={() => {
                    if (playingMsgId === m.id) {
                      stopCurrentAudio();
                    } else {
                      void playTts(m.content, { msgId: m.id });
                    }
                  }}
                >
                  {playingMsgId === m.id ? '■' : ttsErrorIds.has(m.id) ? '⚠ ▶' : '▶'}
                </button>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msg-content-wrap">
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

      <div className="chat-input-row">
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={2}
            placeholder="Pergunte sobre a página atual…"
            value={input}
            disabled={inputDisabled}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {voiceStatus?.stt && recordSecondsLeft !== null && (
            <span className="chat-record-countdown">{recordSecondsLeft}s</span>
          )}
        </div>
        {voiceStatus?.stt && (
          <div className="chat-mic-area">
            <button
              type="button"
              className={`chat-mic-btn${voiceState === 'listening' ? ' listening' : voiceState === 'speaking' ? ' speaking' : ''}`}
              disabled={micDisabled}
              title={
                voiceState === 'listening'
                  ? 'Parar gravação'
                  : voiceState === 'transcribing'
                    ? 'Transcrevendo…'
                    : voiceState === 'speaking'
                      ? 'Reproduzindo'
                      : 'Gravar voz'
              }
              aria-label={voiceState === 'listening' ? 'Parar gravação' : 'Gravar voz'}
              onClick={handleMicClick}
            >
              {voiceState === 'listening' ? '⏹' : voiceState === 'speaking' ? '🔊' : '🎙'}
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={isLoading || !input.trim() || voiceState !== 'idle'}
          onClick={() => void sendMessage()}
        >
          {isLoading ? '…' : 'Enviar →'}
        </button>
      </div>
    </aside>
  );
}
