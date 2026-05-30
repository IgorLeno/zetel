'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/chat-message';
import { NoteCard, type Suggestion } from './NoteCard';
import { MemoryCard, type MemorySuggestionData } from './MemoryCard';

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
  currentPageIndex,
}: {
  zetelId: string;
  currentPageIndex: number | null;
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

  // Quando true, a PRÓXIMA sugestão recebida vem sem "Discutir" (bounded — regra #10).
  const discussNextRef = useRef(false);
  const discussNextMemoryRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

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

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, suggestion, memorySuggestion, scrollToBottom]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

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

  async function sendMessage(rawText?: string) {
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
        {loaded && messages.length === 0 && !streaming && (
          <p className="chat-placeholder">Pergunte sobre a página atual.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            <div className="msg-bubble" data-testid="msg-bubble" data-role={m.role}>
              {m.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msg-bubble streaming" data-testid="msg-bubble" data-role="streaming">
              {streaming}
              <span className="streaming-cursor" aria-hidden />
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
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          placeholder="Pergunte sobre a página atual…"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn primary"
          disabled={isLoading || !input.trim()}
          onClick={() => void sendMessage()}
        >
          {isLoading ? '…' : 'Enviar →'}
        </button>
      </div>
    </aside>
  );
}
