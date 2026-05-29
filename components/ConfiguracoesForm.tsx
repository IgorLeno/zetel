'use client';

import { useState } from 'react';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;

export function ConfiguracoesForm({
  initialVaultPath,
  hasKey,
  initialModel,
  initialHistoryWindow,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialHistoryWindow: number;
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
  const [historyWindow, setHistoryWindow] = useState(String(initialHistoryWindow));
  const [modelFeedback, setModelFeedback] = useState<Feedback>(null);
  const [savingModel, setSavingModel] = useState(false);

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
          chat_history_window: windowNum,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModelFeedback({ kind: 'ok', text: 'Modelo e janela de histórico salvos.' });
      } else {
        setModelFeedback({ kind: 'err', text: data.error ?? 'Falha ao salvar.' });
      }
    } catch {
      setModelFeedback({ kind: 'err', text: 'Erro de rede ao salvar.' });
    } finally {
      setSavingModel(false);
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
    </div>
  );
}
