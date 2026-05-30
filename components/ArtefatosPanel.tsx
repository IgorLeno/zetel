'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatRelative } from '@/lib/relative-time';
import { formatBytes } from '@/lib/format-utils';

interface ArtifactsInfo {
  mode: 'tecnico' | 'legado' | null;
  openArtifact: {
    kind: 'documento-tecnico';
    mode: 'tecnico' | 'legado';
    filename: string;
  } | null;
  leituraHtml: {
    exists: boolean;
    mode: 'tecnico' | 'legado' | null;
    filename: string;
    sizeBytes: number | null;
    lastBuiltAt: string | null;
    pagesCount: number;
  };
  documentoTecnico: {
    exists: boolean;
    mode: 'tecnico' | 'legado' | null;
    filename: string;
    sizeBytes: number | null;
    lastBuiltAt: string | null;
    pagesCount: number;
  };
  guiaEstudo: {
    exists: false;
    filename: 'guia-estudo.html';
    metaExists: false;
    metaFilename: 'guia-estudo.meta.json';
    sourceExists: false;
    sourceFilename: 'guia-estudo.source.json';
  };
}

export function ArtefatosPanel({ zetelId }: { zetelId: string }) {
  const [info, setInfo] = useState<ArtifactsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/artifacts`);
      const data = await res.json();
      if (res.ok) {
        setInfo(data);
      } else {
        setError(data.error ?? 'Falha ao carregar artefatos.');
      }
    } catch {
      setError('Erro de rede ao carregar artefatos.');
    } finally {
      setLoading(false);
    }
  }, [zetelId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/build`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao regenerar o artefato.');
        return;
      }
      await load();
    } catch {
      setError('Erro de rede ao regenerar.');
    } finally {
      setRegenerating(false);
    }
  }

  function onDownload() {
    window.open(`/api/zetels/${zetelId}/leitura`, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return <div className="empty-state"><div>Carregando artefatos…</div></div>;
  }

  if (error && !info?.leituraHtml.exists) {
    return <p className="feedback err">{error}</p>;
  }

  const html = info?.leituraHtml;
  if (!html?.exists) {
    return (
      <div className="empty-state">
        <div>Nenhum artefato gerado ainda. Use &quot;Preparar leitura&quot; na aba Leitura.</div>
      </div>
    );
  }

  return (
    <div className="artefatos-panel content-narrow">
      {error && <p className="feedback err">{error}</p>}
      <div className="artefato-card">
        <div className="artefato-name">
          {html.filename}
          {html.mode === 'legado' ? ' (legado)' : ''}
        </div>
        <div className="file-meta">
          {html.lastBuiltAt ? formatRelative(html.lastBuiltAt) : '—'}
          {' · '}
          {formatBytes(html.sizeBytes)}
          {' · '}
          {html.pagesCount} {html.pagesCount === 1 ? 'página' : 'páginas'}
        </div>
        <div className="artefato-actions">
          <button type="button" className="btn" onClick={onDownload}>
            Baixar HTML
          </button>
          <button type="button" className="btn primary" disabled={regenerating} onClick={onRegenerate}>
            {regenerating ? 'Regenerando…' : 'Regenerar'}
          </button>
        </div>
      </div>
    </div>
  );
}
