'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_LIVE_VOICE, LIVE_VOICES } from '@/lib/live-options';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;
type KeySource = 'config' | 'environment' | null;

/**
 * Chave Gemini (AI Studio) e voz do modo Live (SPEC-016 D7, D10). A chave só
 * vai do navegador ao servidor; o servidor devolve apenas `configured`/`source`.
 */
export function GeminiLiveSettings() {
  const [apiKey, setApiKey] = useState('');
  const [keySource, setKeySource] = useState<KeySource>(null);
  const [keyFeedback, setKeyFeedback] = useState<Feedback>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [voice, setVoice] = useState(DEFAULT_LIVE_VOICE);
  const [voiceFeedback, setVoiceFeedback] = useState<Feedback>(null);
  const [savingVoice, setSavingVoice] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config/gemini', { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('status');
        const data = await res.json();
        setKeySource(data.configured === true ? data.source : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setKeyFeedback({ kind: 'err', text: 'Não foi possível atualizar o estado da chave Gemini.' });
        }
      });
    fetch('/api/settings', { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('settings');
        const data = await res.json();
        if (typeof data.live_voice === 'string') setVoice(data.live_voice);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setVoiceFeedback({ kind: 'err', text: 'Não foi possível carregar a voz Live.' });
        }
      });
    return () => controller.abort();
  }, []);

  async function saveKey() {
    if (!apiKey.trim()) {
      setKeyFeedback({ kind: 'err', text: 'Informe a chave antes de salvar.' });
      return;
    }
    setSavingKey(true);
    setKeyFeedback(null);
    try {
      const res = await fetch('/api/config/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.configured === true && data.source === 'config') {
        setApiKey('');
        setKeySource('config');
        setKeyFeedback({ kind: 'ok', text: 'Chave Gemini salva no arquivo de configuração local.' });
      } else {
        setKeyFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar a chave Gemini.' });
      }
    } catch {
      setKeyFeedback({ kind: 'err', text: 'Erro de rede ao salvar a chave Gemini.' });
    } finally {
      setSavingKey(false);
    }
  }

  async function saveVoice() {
    setSavingVoice(true);
    setVoiceFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_voice: voice }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof data.live_voice === 'string') setVoice(data.live_voice);
        setVoiceFeedback({ kind: 'ok', text: 'Voz Live salva.' });
      } else {
        setVoiceFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar a voz Live.' });
      }
    } catch {
      setVoiceFeedback({ kind: 'err', text: 'Erro de rede ao salvar a voz Live.' });
    } finally {
      setSavingVoice(false);
    }
  }

  return (
    <>
      <div className="section-title">Gemini Live</div>
      <div className="field">
        <label className="field-label" htmlFor="gemini-apikey">
          Chave da API (Google AI Studio)
        </label>
        <div className="field-row">
          <input
            id="gemini-apikey"
            className="input"
            type="password"
            placeholder={keySource ? '•••••••••• (chave configurada)' : 'AIza...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <button className="btn primary" onClick={saveKey} disabled={savingKey} type="button">
            {savingKey ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Usada só pelo servidor para abrir sessões do modo Live; fica no arquivo de configuração local
          com permissão 600 e nunca vai ao navegador.
        </p>
        {keySource && (
          <p className="field-hint">
            Chave Gemini configurada ({keySource === 'config' ? 'configuração local' : 'ambiente'}).
          </p>
        )}
        {keyFeedback && <p className={`feedback ${keyFeedback.kind}`}>{keyFeedback.text}</p>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="live-voice">
          Voz do modo Live
        </label>
        <div className="field-row">
          <select id="live-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {LIVE_VOICES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button className="btn" onClick={saveVoice} disabled={savingVoice} type="button">
            {savingVoice ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">Independente da voz da aba Voz; padrão {DEFAULT_LIVE_VOICE}.</p>
        {voiceFeedback && <p className={`feedback ${voiceFeedback.kind}`}>{voiceFeedback.text}</p>}
      </div>
    </>
  );
}
