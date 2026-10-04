'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TTS_INSTRUCTIONS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  MAX_TTS_INSTRUCTIONS_CHARS,
  TTS_MODELS,
  TTS_TONE_PRESETS,
  TTS_VOICES,
  matchTonePreset,
  ttsModelSupportsInstructions,
  ttsVoiceSupportedBy,
} from '@/lib/tts-options';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;

type VoiceSettings = { tts_model: string; tts_voice: string; tts_instructions: string };

const CUSTOM_TONE = 'personalizado';
const SAMPLE_TEXT =
  'Oi! Vamos revisar juntos? Me conta o que você já entendeu do capítulo e a gente aprofunda daí.';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error === 'tts_unavailable' ? 'Chave OpenAI não configurada.' : data.error;
    }
  } catch { /* corpo não-JSON */ }
  return `${fallback} (${res.status}).`;
}

/** Aba Voz (SPEC-005): modelo, voz e tom da parceira por seleção validada. */
export function VozPanel() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_TTS_MODEL);
  const [voice, setVoice] = useState(DEFAULT_TTS_VOICE);
  const [instructions, setInstructions] = useState(DEFAULT_TTS_INSTRUCTIONS);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

  function apply(data: VoiceSettings) {
    setModel(data.tts_model);
    setVoice(data.tts_voice);
    setInstructions(data.tts_instructions);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, 'Falha ao carregar'));
        apply((await res.json()) as VoiceSettings);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Erro de rede ao carregar.');
      });
    return () => controller.abort();
  }, []);

  // Para a amostra e libera a URL do blob ao sair da aba.
  useEffect(() => () => stopPreview(), []);

  function stopPreview() {
    const current = audioRef.current;
    if (!current) return;
    current.audio.pause();
    URL.revokeObjectURL(current.url);
    audioRef.current = null;
  }

  const toneSupported = ttsModelSupportsInstructions(model);
  const voiceOk = ttsVoiceSupportedBy(model, voice);
  const trimmed = instructions.trim();
  const tooLong = trimmed.length > MAX_TTS_INSTRUCTIONS_CHARS;
  const tonePreset = matchTonePreset(instructions) ?? CUSTOM_TONE;
  const valid = voiceOk && !tooLong;
  const busy = saving || previewing;

  function onModelChange(next: string) {
    setModel(next);
    setFeedback(null);
  }

  function onPresetChange(id: string) {
    const preset = TTS_TONE_PRESETS.find((p) => p.id === id);
    // "Personalizado" mantém o texto atual para edição livre.
    if (preset) setInstructions(preset.instructions);
  }

  async function preview() {
    if (!valid) return;
    stopPreview();
    setPreviewing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: SAMPLE_TEXT,
          model,
          voice,
          // Vazio cai no tom salvo/padrão no servidor; tts-1* ignora de qualquer forma.
          instructions: trimmed || DEFAULT_TTS_INSTRUCTIONS,
        }),
      });
      if (!res.ok) {
        setFeedback({ kind: 'err', text: await readError(res, 'Falha ao gerar amostra') });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = { audio, url };
      audio.onended = () => stopPreview();
      await audio.play();
    } catch {
      stopPreview();
      setFeedback({ kind: 'err', text: 'Não foi possível tocar a amostra.' });
    } finally {
      setPreviewing(false);
    }
  }

  async function persist(payload: Record<string, string>, okText: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setFeedback({ kind: 'err', text: await readError(res, 'Falha ao salvar') });
        return;
      }
      apply((await res.json()) as VoiceSettings);
      setFeedback({ kind: 'ok', text: okText });
    } catch {
      setFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!valid) return;
    // Tom igual ao padrão grava vazio, para seguir ajustes futuros do padrão (D4).
    const tone = trimmed === DEFAULT_TTS_INSTRUCTIONS ? '' : trimmed;
    void persist({ tts_model: model, tts_voice: voice, tts_instructions: tone }, 'Voz salva.');
  }

  function restore() {
    void persist({ tts_model: '', tts_voice: '', tts_instructions: '' }, 'Padrões restaurados.');
  }

  if (loadError) return <p className="feedback err">{loadError}</p>;
  if (!loaded) return <p className="field-hint">Carregando…</p>;

  return (
    <div>
      <div className="section-title">Voz da parceira</div>

      <div className="field">
        <label className="field-label" htmlFor="tts-model">Modelo</label>
        <select id="tts-model" value={model} onChange={(e) => onModelChange(e.target.value)}>
          {TTS_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="field-hint">
          O gpt-4o-mini-tts soa mais natural e segue o tom abaixo; tts-1 e tts-1-hd ignoram o tom.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="tts-voice">Voz</label>
        <select id="tts-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {TTS_VOICES.map((v) => {
            const supported = ttsVoiceSupportedBy(model, v.id);
            return (
              <option key={v.id} value={v.id} disabled={!supported}>
                {v.id}
                {v.id === DEFAULT_TTS_VOICE ? ' (padrão)' : ''}
                {supported ? '' : ' — só gpt-4o-mini-tts'}
              </option>
            );
          })}
        </select>
        {!voiceOk && (
          <p className="feedback err">A voz {voice} não existe no {model}. Escolha outra voz.</p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="tts-tone">Tom</label>
        <select
          id="tts-tone"
          value={tonePreset}
          disabled={!toneSupported}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {TTS_TONE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          <option value={CUSTOM_TONE}>Personalizado</option>
        </select>
        <textarea
          id="tts-instructions"
          aria-label="Instrução de tom"
          rows={6}
          value={instructions}
          disabled={!toneSupported}
          onChange={(e) => setInstructions(e.target.value)}
          style={{ marginTop: 8, width: '100%' }}
        />
        <p className={tooLong ? 'feedback err' : 'field-hint'}>
          {trimmed.length}/{MAX_TTS_INSTRUCTIONS_CHARS} caracteres
          {toneSupported ? '' : ' · ignorado pelo modelo selecionado'}
        </p>
      </div>

      <div className="field">
        <div className="field-row">
          <button className="btn" type="button" onClick={preview} disabled={!valid || busy}>
            {previewing ? 'Gerando…' : 'Ouvir amostra'}
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={!valid || busy}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn" type="button" onClick={restore} disabled={busy}>
            Restaurar padrão
          </button>
        </div>
        <p className="field-hint">
          A amostra usa a seleção atual sem salvar; cada clique é uma chamada curta à OpenAI.
        </p>
        {feedback && <p className={`feedback ${feedback.kind}`}>{feedback.text}</p>}
      </div>
    </div>
  );
}
