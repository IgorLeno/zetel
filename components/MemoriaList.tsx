'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatRelative } from '@/lib/relative-time';

interface MemoryItem {
  slug: string;
  titulo: string;
  corpo: string;
  origem: string | null;
  zetelOrigem: string | null;
  criadaEm: string | null;
  atualizadaEm: string | null;
  relPath: string;
  absPath: string;
  bytes: number;
  long: boolean;
}

/**
 * Aba Memória (Módulo 7). Memória global do parceiro, sem editor embutido
 * (regra #14). Abertura externa em cascata (D14): Obsidian URI → copiar caminho
 * → abrir pasta. Lista lida sob demanda; edições externas no Obsidian aparecem
 * ao recarregar.
 */
export function MemoriaList() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [vaultName, setVaultName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      if (res.ok) {
        setVaultName(data.vaultName ?? '');
        setMemories(data.memories ?? []);
      } else {
        setError(data.error ?? 'Falha ao carregar memórias.');
      }
    } catch {
      setError('Erro de rede ao carregar memórias.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  function openInObsidian(relPath: string) {
    const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relPath)}`;
    window.location.href = uri;
  }

  async function copyPath(absPath: string) {
    try {
      await navigator.clipboard.writeText(absPath);
      showToast('Caminho copiado.');
    } catch {
      showToast('Não foi possível copiar — selecione manualmente.');
    }
  }

  async function revealFolder(relPath: string) {
    try {
      const res = await fetch('/api/memory/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath }),
      });
      if (res.ok) showToast('Abrindo a pasta…');
      else showToast('Não foi possível abrir a pasta.');
    } catch {
      showToast('Não foi possível abrir a pasta.');
    }
  }

  if (!loaded) {
    return (
      <div className="empty-state">
        <div>Carregando memórias…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div>{error}</div>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="empty-state">
        <div>Nenhuma memória registrada ainda.</div>
        <div className="field-hint">
          As memórias aparecem aqui quando você aceitar sugestões do parceiro durante as conversas.
        </div>
      </div>
    );
  }

  return (
    <div className="notas-panel" data-testid="memoria-panel">
      <ul className="notas-list">
        {memories.map((m) => (
          <li key={m.relPath} className="nota-item">
            <div className="nota-main">
              <span className="nota-titulo">{m.titulo}</span>
              <span className="nota-meta">
                {m.criadaEm ? formatRelative(m.criadaEm) : 'sem data'}
                {m.origem ? ` · ${m.origem}` : ''}
              </span>
              {m.corpo && (
                <span className="nota-preview">
                  {m.corpo.slice(0, 150)}
                  {m.corpo.length > 150 ? '…' : ''}
                </span>
              )}
              {m.long && (
                <span className="memoria-long-badge">Memória longa — considere consolidar.</span>
              )}
            </div>
            <div className="nota-actions">
              <button type="button" className="btn btn-sm" onClick={() => openInObsidian(m.relPath)}>
                Abrir no Obsidian
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void copyPath(m.absPath)}>
                Copiar caminho
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void revealFolder(m.relPath)}>
                Abrir pasta
              </button>
            </div>
          </li>
        ))}
      </ul>
      {toast && <div className="chat-toast">{toast}</div>}
    </div>
  );
}
