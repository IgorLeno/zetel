'use client';

import { useState } from 'react';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;

export function ConfiguracoesForm({
  initialVaultPath,
  hasKey,
  initialModel,
  initialStudyGuideModel,
  initialHistoryWindow,
  initialStudyGuideMaxTokens,
  initialStudyGuideTimeoutS,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialStudyGuideModel: string;
  initialHistoryWindow: number;
  initialStudyGuideMaxTokens: number;
  initialStudyGuideTimeoutS: number;
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

  // ── Modelo e chat ──
  const [model, setModel] = useState(initialModel);
  const [studyGuideModel, setStudyGuideModel] = useState(initialStudyGuideModel);
  const [historyWindow, setHistoryWindow] = useState(String(initialHistoryWindow));
  const [modelFeedback, setModelFeedback] = useState<Feedback>(null);
  const [savingModel, setSavingModel] = useState(false);

  // ── Limites de geração (LLM) ──
  const [maxTokens, setMaxTokens] = useState(String(initialStudyGuideMaxTokens));
  const [timeoutS, setTimeoutS] = useState(String(initialStudyGuideTimeoutS));
  const [limitsFeedback, setLimitsFeedback] = useState<Feedback>(null);
  const [savingLimits, setSavingLimits] = useState(false);

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

  async function saveModel() {
    setSavingModel(true);
    setModelFeedback(null);
    const windowNum = Number.parseInt(historyWindow, 10);
    if (!Number.isFinite(windowNum) || windowNum < 1 || windowNum > 50) {
      setModelFeedback({ kind: 'err', text: 'Janela de histórico deve ser entre 1 e 50.' });
      setSavingModel(false);
      return;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_model: model.trim(),
          study_guide_model: studyGuideModel.trim(),
          chat_history_window: windowNum,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModelFeedback({ kind: 'ok', text: 'Modelos e janela de histórico salvos.' });
      } else {
        setModelFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setModelFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingModel(false);
    }
  }

  async function saveLimits() {
    const tokensNum = Number.parseInt(maxTokens, 10);
    if (!Number.isFinite(tokensNum) || tokensNum < 4000 || tokensNum > 32000) {
      setLimitsFeedback({ kind: 'err', text: 'Máximo de tokens deve ser entre 4000 e 32000.' });
      return;
    }
    const timeoutNum = Number.parseInt(timeoutS, 10);
    if (!Number.isFinite(timeoutNum) || timeoutNum < 30 || timeoutNum > 300) {
      setLimitsFeedback({ kind: 'err', text: 'Timeout deve ser entre 30 e 300 segundos.' });
      return;
    }
    setSavingLimits(true);
    setLimitsFeedback(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_guide_max_tokens: tokensNum,
          study_guide_timeout_s: timeoutNum,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLimitsFeedback({ kind: 'ok', text: 'Limites de geração salvos.' });
      } else {
        setLimitsFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setLimitsFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingLimits(false);
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
          <button className="btn" onClick={saveModel} disabled={savingModel} type="button">
            {savingModel ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">Identificador do modelo no OpenRouter usado pelo parceiro.</p>
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
        </div>
        <p className="field-hint">
          Modelo usado exclusivamente para gerar o Guia de Estudo. Deixe em branco para usar o
          modelo padrão.
        </p>
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
        </div>
        <p className="field-hint">
          Quantas mensagens anteriores enviar ao parceiro em cada turno (1–50, padrão 10).
        </p>
        {modelFeedback && <p className={`feedback ${modelFeedback.kind}`}>{modelFeedback.text}</p>}
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
            min={4000}
            max={32000}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </div>
        <p className="field-hint">
          Limite de tokens da resposta do modelo ao gerar o Guia de Estudo (4000–32000).
        </p>
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
            min={30}
            max={300}
            value={timeoutS}
            onChange={(e) => setTimeoutS(e.target.value)}
          />
          <button className="btn" onClick={saveLimits} disabled={savingLimits} type="button">
            {savingLimits ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p className="field-hint">
          Tempo máximo para a resposta do modelo ao gerar o Guia de Estudo (30–300s).
        </p>
        {limitsFeedback && (
          <p className={`feedback ${limitsFeedback.kind}`}>{limitsFeedback.text}</p>
        )}
      </div>
    </div>
  );
}
