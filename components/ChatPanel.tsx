'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types/chat-message';

function parseSseChunk(text: string): {
  chunks: string[];
  error: string | null;
  done: boolean;
} {
  const chunks: string[] = [];
  let error: string | null = null;
  let done = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    if (payload.startsWith('[ERROR]')) {
      error = payload.slice('[ERROR]'.length).trim();
      done = true;
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as string;
      if (typeof parsed === 'string') chunks.push(parsed);
    } catch {
      /* ignora linha malformada */
    }
  }

  return { chunks, error, done };
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
  }, [messages, streaming, scrollToBottom]);

  async function clearHistory() {
    if (!confirm('Apagar todo o histórico deste Zetel?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/chat`, { method: 'DELETE' });
      if (res.ok) {
        setMessages([]);
        setStreaming('');
      }
    } catch {
      setError('Falha ao limpar o histórico.');
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setError(null);
    setIsLoading(true);
    setStreaming('');

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseSseChunk(decoder.decode(value, { stream: true }));
        if (parsed.error) streamError = parsed.error;
        for (const c of parsed.chunks) {
          accumulated += c;
          setStreaming(accumulated);
        }
      }

      setStreaming('');

      if (streamError) {
        setError(streamError);
      } else {
        const histRes = await fetch(`/api/zetels/${zetelId}/chat`);
        const histData = await histRes.json();
        if (histRes.ok) setMessages(histData.messages ?? []);
      }
    } catch {
      setError('Erro de rede ao conversar com o parceiro.');
      setStreaming('');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
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
        <button type="button" className="btn btn-sm" onClick={() => void clearHistory()}>
          Limpar
        </button>
      </header>

      <div className="chat-messages" ref={messagesRef}>
        {!loaded && <p className="chat-placeholder">Carregando histórico…</p>}
        {loaded && messages.length === 0 && !streaming && (
          <p className="chat-placeholder">Pergunte sobre a página atual.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            <div className="msg-bubble">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-assistant">
            <div className="msg-bubble streaming">
              {streaming}
              <span className="streaming-cursor" aria-hidden />
            </div>
          </div>
        )}
        {error && <p className="feedback err chat-inline-error">{error}</p>}
      </div>

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
