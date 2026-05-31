'use client';

import { useState } from 'react';
import {
  STUDY_GUIDE_MAX_TOKENS_MAX,
  STUDY_GUIDE_MAX_TOKENS_MIN,
  STUDY_GUIDE_TIMEOUT_S_MAX,
  STUDY_GUIDE_TIMEOUT_S_MIN,
} from '@/lib/study-guide-constants';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;
type HistoryKey = 'model_history' | 'study_guide_model_history';

function ModelHistoryDropdown({
  history,
  onUse,
  onRemove,
}: {
  history: string[];
  onUse: (model: string) => void;
  onRemove: (model: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="model-history">
      <button
        type="button"
        className="model-history-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="model-history-icon" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        Modelos usados
      </button>
      {expanded && (
        <ul className="model-history-list">
          {history.map((entry) => (
            <li key={entry} className="model-history-item">
              <span className="model-history-id">{entry}</span>
              <button type="button" className="btn" onClick={() => onUse(entry)}>
                Usar
              </button>
              <button
                type="button"
                className="btn model-history-remove"
                onClick={() => onRemove(entry)}
                aria-label={`Remover ${entry}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConfiguracoesForm({
  initialVaultPath,
  hasKey,
  initialModel,
  initialStudyGuideModel,
  initialHistoryWindow,
  initialStudyGuideMaxTokens,
  initialStudyGuideTimeoutS,
  initialModelHistory,
  initialStudyGuideModelHistory,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialStudyGuideModel: string;
  initialHistoryWindow: number;
  initialStudyGuideMaxTokens: number;
  initialStudyGuideTimeoutS: number;
  initialModelHistory: string[];
  initialStudyGuideModelHistory: string[];
}) {
  // ── Vault ──
  const [vaultPath, setVaultPath] = useState(initialVaultPath);
  const [vaultFeedback, setVaultFeedback] = useState<Feedback>(null);
  const [savingVault, setSavingVault] = useState(false);

  // ── Chave ──
  const [apiKey, setApiKey] = useState('');
  const [keyStored, setKeyStored] = useState(hasKey);
  const [keyFeedback, setKeyFeedback] = useState<Feedback>(null);
  const [savingKey, setSavingKey] = useState(false);

  // ── Teste de conexão ──
  const [testFeedback, setTestFeedback] = useState<Feedback>(null);
  const [testing, setTesting] = useState(false);

  // ── Modelo padrão ──
  const [model, setModel] = useState(initialModel);
  const [modelHistory, setModelHistory] = useState(initialModelHistory);
  const [defaultModelFeedback, setDefaultModelFeedback] = useState<Feedback>(null);
  const [savingDefaultModel, setSavingDefaultModel] = useState(false);

  // ── Modelo do Guia de Estudo ──
  const [studyGuideModel, setStudyGuideModel] = useState(initialStudyGuideModel);
  const [studyGuideModelHistory, setStudyGuideModelHistory] = useState(
    initialStudyGuideModelHistory,
  );
  const [studyGuideModelFeedback, setStudyGuideModelFeedback] = useState<Feedback>(null);
  const [savingStudyGuideModel, setSavingStudyGuideModel] = useState(false);

  // ── Janela de histórico ──
  const [historyWindow, setHistoryWindow] = useState(String(initialHistoryWindow));
  const [historyWindowFeedback, setHistoryWindowFeedback] = useState<Feedback>(null);
  const [savingHistoryWindow, setSavingHistoryWindow] = useState(false);

  // ── Máximo de tokens ──
  const [maxTokens, setMaxTokens] = useState(String(initialStudyGuideMaxTokens));
  const [maxTokensFeedback, setMaxTokensFeedback] = useState<Feedback>(null);
  const [savingMaxTokens, setSavingMaxTokens] = useState(false);

  // ── Timeout ──
  const [timeoutS, setTimeoutS] = useState(String(initialStudyGuideTimeoutS));
  const [timeoutFeedback, setTimeoutFeedback] = useState<Feedback>(null);
  const [savingTimeout, setSavingTimeout] = useState(false);

  async function saveVault() {
    setSavingVault(true);
    setVaultFeedback(null);
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: vaultPath }),
      });
      const data = await res.json();
      if (res.ok) {
        setVaultFeedback({ kind: 'ok', text: 'Vault salvo e estrutura criada com sucesso.' });
      } else {
        setVaultFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar o vault.' });
      }
    } catch {
      setVaultFeedback({ kind: 'err', text: 'Erro de rede ao salvar o vault.' });
    } finally {
      setSavingVault(false);
    }
  }

  async function saveKey() {
    if (!apiKey.trim()) {
      setKeyFeedback({ kind: 'err', text: 'Informe a chave antes de salvar.' });
      return;
    }
    setSavingKey(true);
    setKeyFeedback(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKey('');
        setKeyStored(true);
        setKeyFeedback({ kind: 'ok', text: 'Chave salva com segurança em ~/.zetel/config.' });
      } else {
        setKeyFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar a chave.' });
      }
    } catch {
      setKeyFeedback({ kind: 'err', text: 'Erro de rede ao salvar a chave.' });
    } finally {
      setSavingKey(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestFeedback(null);
    try {
      const res = await fetch('/api/openrouter/test', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestFeedback({
          kind: 'ok',
          text: `✓ Conectado (modelo: ${data.model ?? model})`,
        });
      } else {
        setTestFeedback({ kind: 'err', text: data.error ?? 'Falha na conexão.' });
      }
    } catch {
      setTestFeedback({ kind: 'err', text: 'Erro de rede ao testar a conexão.' });
    } finally {
      setTesting(false);
    }
  }

  async function saveDefaultModel() {
    const trimmed = model.trim();
    if (!trimmed) {
      setDefaultModelFeedback({ kind: 'err', text: 'Informe o identificador do modelo.' });
      return;
    }
    setSavingDefaultModel(true);
    setDefaultModelFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_model: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setDefaultModelFeedback({ kind: 'ok', text: 'Modelo padrão salvo.' });
        if (Array.isArray(data.model_history)) {
          setModelHistory(data.model_history);
        }
      } else {
        setDefaultModelFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setDefaultModelFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingDefaultModel(false);
    }
  }

  async function saveStudyGuideModelField() {
    setSavingStudyGuideModel(true);
    setStudyGuideModelFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_guide_model: studyGuideModel.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStudyGuideModelFeedback({ kind: 'ok', text: 'Modelo do Guia de Estudo salvo.' });
        if (Array.isArray(data.study_guide_model_history)) {
          setStudyGuideModelHistory(data.study_guide_model_history);
        }
      } else {
        setStudyGuideModelFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setStudyGuideModelFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingStudyGuideModel(false);
    }
  }

  async function saveHistoryWindowField() {
    const windowNum = Number.parseInt(historyWindow, 10);
    if (!Number.isFinite(windowNum) || windowNum < 1 || windowNum > 50) {
      setHistoryWindowFeedback({ kind: 'err', text: 'Janela de histórico deve ser entre 1 e 50.' });
      return;
    }
    setSavingHistoryWindow(true);
    setHistoryWindowFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_history_window: windowNum }),
      });
      const data = await res.json();
      if (res.ok) {
        setHistoryWindowFeedback({ kind: 'ok', text: 'Janela de histórico salva.' });
      } else {
        setHistoryWindowFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setHistoryWindowFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingHistoryWindow(false);
    }
  }

  async function saveMaxTokensField() {
    const tokensNum = Number.parseInt(maxTokens, 10);
    if (
      !Number.isFinite(tokensNum) ||
      tokensNum < STUDY_GUIDE_MAX_TOKENS_MIN ||
      tokensNum > STUDY_GUIDE_MAX_TOKENS_MAX
    ) {
      setMaxTokensFeedback({
        kind: 'err',
        text: `Máximo de tokens deve ser entre ${STUDY_GUIDE_MAX_TOKENS_MIN} e ${STUDY_GUIDE_MAX_TOKENS_MAX}.`,
      });
      return;
    }
    setSavingMaxTokens(true);
    setMaxTokensFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_guide_max_tokens: tokensNum }),
      });
      const data = await res.json();
      if (res.ok) {
        setMaxTokensFeedback({ kind: 'ok', text: 'Máximo de tokens salvo.' });
      } else {
        setMaxTokensFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setMaxTokensFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingMaxTokens(false);
    }
  }

  async function saveTimeoutField() {
    const timeoutNum = Number.parseInt(timeoutS, 10);
    if (
      !Number.isFinite(timeoutNum) ||
      timeoutNum < STUDY_GUIDE_TIMEOUT_S_MIN ||
      timeoutNum > STUDY_GUIDE_TIMEOUT_S_MAX
    ) {
      setTimeoutFeedback({
        kind: 'err',
        text: `Timeout deve ser entre ${STUDY_GUIDE_TIMEOUT_S_MIN} e ${STUDY_GUIDE_TIMEOUT_S_MAX} segundos.`,
      });
      return;
    }
    setSavingTimeout(true);
    setTimeoutFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_guide_timeout_s: timeoutNum }),
      });
      const data = await res.json();
      if (res.ok) {
        setTimeoutFeedback({ kind: 'ok', text: 'Timeout salvo.' });
      } else {
        setTimeoutFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setTimeoutFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingTimeout(false);
    }
  }

  async function removeFromHistory(key: HistoryKey, entry: string) {
    try {
      const res = await fetch('/api/settings/model-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, model: entry }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.history)) {
        if (key === 'model_history') {
          setModelHistory(data.history);
        } else {
          setStudyGuideModelHistory(data.history);
        }
      }
    } catch {
      // Falha silenciosa — usuário pode tentar novamente
    }
  }

  return (
    <div>
      {/* ── Vault ── */}
      <div className="section-title">Vault</div>
      <div className="field">
        <label className="field-label" htmlFor="vault">
          Caminho do vault
        </label>
        <div className="field-row">
          <input
            id="vault"
            className="input"
            type="text"
            placeholder="/home/voce/MeuVault"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
          />
          <button className="btn primary" onClick={saveVault} disabled={savingVault} type="button">
            {savingVault ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Pasta onde o Zetel guarda seus arquivos Markdown, notas e memória. Será criada se ainda não
          existir.
        </p>
        {vaultFeedback && <p className={`feedback ${vaultFeedback.kind}`}>{vaultFeedback.text}</p>}
      </div>

      {/* ── OpenRouter ── */}
      <div className="section-title">OpenRouter</div>
      <div className="field">
        <label className="field-label" htmlFor="apikey">
          Chave da API
        </label>
        <div className="field-row">
          <input
            id="apikey"
            className="input"
            type="password"
            placeholder={keyStored ? '•••••••••• (chave salva)' : 'sk-or-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <button className="btn primary" onClick={saveKey} disabled={savingKey} type="button">
            {savingKey ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Guardada apenas em ~/.zetel/config com permissão 600 — nunca no banco, no vault ou no git.
        </p>
        {keyFeedback && <p className={`feedback ${keyFeedback.kind}`}>{keyFeedback.text}</p>}
      </div>

      <div className="field">
        <label className="field-label">Teste de conexão</label>
        <div className="field-row">
          <button className="btn" onClick={testConnection} disabled={testing} type="button">
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
        </div>
        {testFeedback && <p className={`feedback ${testFeedback.kind}`}>{testFeedback.text}</p>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="model">
          Modelo padrão
        </label>
        <div className="field-row">
          <input
            id="model"
            className="input"
            type="text"
            placeholder="anthropic/claude-3.5-haiku"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <button
            className="btn"
            onClick={saveDefaultModel}
            disabled={savingDefaultModel}
            type="button"
          >
            {savingDefaultModel ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">Identificador do modelo no OpenRouter usado pelo parceiro.</p>
        {defaultModelFeedback && (
          <p className={`feedback ${defaultModelFeedback.kind}`}>{defaultModelFeedback.text}</p>
        )}
        <ModelHistoryDropdown
          history={modelHistory}
          onUse={setModel}
          onRemove={(entry) => removeFromHistory('model_history', entry)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="study-guide-model">
          Modelo do Guia de Estudo
        </label>
        <div className="field-row">
          <input
            id="study-guide-model"
            className="input"
            type="text"
            placeholder="Mesmo que o modelo padrão"
            value={studyGuideModel}
            onChange={(e) => setStudyGuideModel(e.target.value)}
          />
          <button
            className="btn"
            onClick={saveStudyGuideModelField}
            disabled={savingStudyGuideModel}
            type="button"
          >
            {savingStudyGuideModel ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Modelo usado exclusivamente para gerar o Guia de Estudo. Deixe em branco para usar o
          modelo padrão.
        </p>
        {studyGuideModelFeedback && (
          <p className={`feedback ${studyGuideModelFeedback.kind}`}>
            {studyGuideModelFeedback.text}
          </p>
        )}
        <ModelHistoryDropdown
          history={studyGuideModelHistory}
          onUse={setStudyGuideModel}
          onRemove={(entry) => removeFromHistory('study_guide_model_history', entry)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="history-window">
          Janela de histórico
        </label>
        <div className="field-row">
          <input
            id="history-window"
            className="input"
            type="number"
            min={1}
            max={50}
            value={historyWindow}
            onChange={(e) => setHistoryWindow(e.target.value)}
          />
          <button
            className="btn"
            onClick={saveHistoryWindowField}
            disabled={savingHistoryWindow}
            type="button"
          >
            {savingHistoryWindow ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Quantas mensagens anteriores enviar ao parceiro em cada turno (1–50, padrão 10).
        </p>
        {historyWindowFeedback && (
          <p className={`feedback ${historyWindowFeedback.kind}`}>{historyWindowFeedback.text}</p>
        )}
      </div>

      {/* ── Limites de Geração (LLM) ── */}
      <div className="section-title">Limites de Geração (LLM)</div>
      <div className="field">
        <label className="field-label" htmlFor="study-guide-max-tokens">
          Máximo de tokens (guia)
        </label>
        <div className="field-row">
          <input
            id="study-guide-max-tokens"
            className="input"
            type="number"
            min={STUDY_GUIDE_MAX_TOKENS_MIN}
            max={STUDY_GUIDE_MAX_TOKENS_MAX}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
          <button
            className="btn"
            onClick={saveMaxTokensField}
            disabled={savingMaxTokens}
            type="button"
          >
            {savingMaxTokens ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Limite de tokens da resposta do modelo ao gerar o Guia de Estudo (
          {STUDY_GUIDE_MAX_TOKENS_MIN}–{STUDY_GUIDE_MAX_TOKENS_MAX}).
        </p>
        {maxTokensFeedback && (
          <p className={`feedback ${maxTokensFeedback.kind}`}>{maxTokensFeedback.text}</p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="study-guide-timeout">
          Timeout de resposta (segundos)
        </label>
        <div className="field-row">
          <input
            id="study-guide-timeout"
            className="input"
            type="number"
            min={STUDY_GUIDE_TIMEOUT_S_MIN}
            max={STUDY_GUIDE_TIMEOUT_S_MAX}
            value={timeoutS}
            onChange={(e) => setTimeoutS(e.target.value)}
          />
          <button className="btn" onClick={saveTimeoutField} disabled={savingTimeout} type="button">
            {savingTimeout ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Tempo máximo para a resposta do modelo ao gerar o Guia de Estudo (
          {STUDY_GUIDE_TIMEOUT_S_MIN}–{STUDY_GUIDE_TIMEOUT_S_MAX}s).
        </p>
        {timeoutFeedback && (
          <p className={`feedback ${timeoutFeedback.kind}`}>{timeoutFeedback.text}</p>
        )}
      </div>
    </div>
  );
}
