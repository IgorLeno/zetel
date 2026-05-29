'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatRelative } from '@/lib/relative-time';

interface NoteItem {
  tipo: 'rapida' | 'literatura';
  titulo: string;
  paginaOrigem: string | null;
  criadaEm: string | null;
  relPath: string;
  absPath: string;
}

/**
 * Aba de listagem de notas (Módulo 6). Sem editor embutido (regra #14).
 * Abertura externa em cascata (D14): Obsidian URI → copiar caminho → abrir pasta.
 */
export function NotasPanel({ zetelId, tipo }: { zetelId: string; tipo: 'rapida' | 'literatura' }) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [vaultName, setVaultName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/zetels/${zetelId}/notes`);
      const data = await res.json();
      if (res.ok) {
        setVaultName(data.vaultName ?? '');
        setNotes((data.notes ?? []).filter((n: NoteItem) => n.tipo === tipo));
      } else {
        setError(data.error ?? 'Falha ao carregar notas.');
      }
    } catch {
      setError('Erro de rede ao carregar notas.');
    } finally {
      setLoaded(true);
    }
  }, [zetelId, tipo]);

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
      const res = await fetch(`/api/zetels/${zetelId}/notes/reveal`, {
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
    return <div className="empty-state"><div>Carregando notas…</div></div>;
  }

  if (error) {
    return <div className="empty-state"><div>{error}</div></div>;
  }

  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <div>Nenhuma nota {tipo === 'rapida' ? 'rápida' : 'de literatura'} ainda. O parceiro pode sugerir uma durante a conversa.</div>
      </div>
    );
  }

  return (
    <div className="notas-panel">
      <ul className="notas-list">
        {notes.map((n) => (
          <li key={n.relPath} className="nota-item">
            <div className="nota-main">
              <span className="nota-titulo">{n.titulo}</span>
              <span className="nota-meta">
                {n.criadaEm ? formatRelative(n.criadaEm) : 'sem data'}
                {n.paginaOrigem ? ` · página: ${n.paginaOrigem}` : ''}
              </span>
            </div>
            <div className="nota-actions">
              <button type="button" className="btn btn-sm" onClick={() => openInObsidian(n.relPath)}>
                Abrir no Obsidian
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void copyPath(n.absPath)}>
                Copiar caminho
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void revealFolder(n.relPath)}>
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
