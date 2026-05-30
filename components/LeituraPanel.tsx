'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPanel } from './ChatPanel';

type ReadingMode = 'tecnico' | 'guia-estudo';
type ReadingArtifact = 'documento-tecnico' | 'guia-estudo';

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
    exists: boolean;
    filename: 'guia-estudo.html';
    metaExists: boolean;
    metaFilename: 'guia-estudo.meta.json';
    sourceExists: boolean;
    sourceFilename: 'guia-estudo.source.json';
  };
}

export function LeituraPanel({
  zetelId,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<ReadingMode>('tecnico');
  const [activeArtifact, setActiveArtifact] = useState<ReadingArtifact>('documento-tecnico');
  const [chatOpen, setChatOpen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null);

  const hasBuilt = lastBuiltAt !== null || artifacts?.documentoTecnico.exists === true;
  const showIframe = hasBuilt && !building;

  const buttonLabel = hasBuilt ? 'Atualizar leitura' : 'Preparar leitura';
  const buttonPrimary = !hasBuilt || readingStale;
  const availableArtifacts = [
    {
      kind: 'documento-tecnico' as const,
      label: 'Documento Técnico',
      exists: artifacts?.documentoTecnico.exists === true,
    },
    {
      kind: 'guia-estudo' as const,
      label: 'Guia de Estudo',
      exists: artifacts?.guiaEstudo.exists === true,
    },
  ].filter((artifact) => artifact.exists);
  const showArtifactToggle = availableArtifacts.length > 1;

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/zetels/${zetelId}/artifacts`);
      const data = await res.json();
      if (res.ok) {
        setArtifacts(data);
        if (data.openArtifact?.kind === 'documento-tecnico') {
          setActiveArtifact('documento-tecnico');
        }
      }
    } catch {
      // A rota de leitura ainda mostra erro próprio se o usuário tentar abrir sem artefato.
    }
  }, [zetelId]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'zetel:page-change' && typeof e.data.pageIndex === 'number') {
        setCurrentPageIndex(e.data.pageIndex);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  // Tema → iframe via postMessage (D13/Regra #2: o app NÃO injeta CSS no iframe;
  // só informa o tema atual). O HTML de leitura aplica `data-theme` ao receber.
  const postCurrentTheme = useCallback(() => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    iframeRef.current?.contentWindow?.postMessage({ type: 'zetel:theme', theme }, '*');
  }, []);

  // ThemeToggle altera `data-theme` no <html>; observamos para repassar ao iframe
  // sem acoplar a este componente (sandbox sem same-origin → targetOrigin '*').
  useEffect(() => {
    const obs = new MutationObserver(() => postCurrentTheme());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, [postCurrentTheme]);

  async function onBuild() {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/build`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao construir a leitura.');
        return;
      }
      await loadArtifacts();
      router.refresh();
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    } catch {
      setError('Erro de rede ao construir a leitura.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="leitura-panel">
      <div className="leitura-toolbar">
        <div className="mode-switch" role="radiogroup" aria-label="Modo de leitura">
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === 'tecnico'}
            className={`mode-option${selectedMode === 'tecnico' ? ' active' : ''}`}
            onClick={() => setSelectedMode('tecnico')}
          >
            Documento Técnico
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === 'guia-estudo'}
            className="mode-option"
            disabled
            title="Em breve"
            onClick={() => setSelectedMode('guia-estudo')}
          >
            Guia de Estudo
          </button>
        </div>
        <button
          type="button"
          className={buttonPrimary ? 'btn primary' : 'btn'}
          disabled={building}
          onClick={onBuild}
        >
          {building ? 'Construindo…' : buttonLabel}
        </button>
        {showIframe && (
          <button
            type="button"
            className="btn"
            onClick={() => setChatOpen((o) => !o)}
          >
            {chatOpen ? 'Fechar chat' : 'Interagir'}
          </button>
        )}
        {hasBuilt && !readingStale && !building && (
          <span className="feedback ok">Leitura pronta para uso.</span>
        )}
      </div>
      {showArtifactToggle && (
        <div className="artifact-switch" role="tablist" aria-label="Artefato aberto">
          {availableArtifacts.map((artifact) => (
            <button
              key={artifact.kind}
              type="button"
              role="tab"
              aria-selected={activeArtifact === artifact.kind}
              className={`artifact-option${activeArtifact === artifact.kind ? ' active' : ''}`}
              onClick={() => setActiveArtifact(artifact.kind)}
            >
              {artifact.label}
            </button>
          ))}
        </div>
      )}
      {error && <p className="feedback err">{error}</p>}

      {!hasBuilt && !building ? (
        <div className="empty-state leitura-empty">
          <div>Nenhuma leitura construída ainda.</div>
        </div>
      ) : building ? (
        <div className="empty-state leitura-empty">
          <div>Gerando HTML de leitura…</div>
        </div>
      ) : (
        /* ChatPanel sempre montado — toggle de visibilidade via CSS para não perder
           streams em curso ao recolher o painel (M6-3). */
        <div className={`leitura-body${chatOpen ? ' leitura-with-chat' : ''}`}>
          <iframe
            ref={iframeRef}
            className="leitura-iframe"
            title="Leitura do Zetel"
            sandbox="allow-scripts"
            src={`/api/zetels/${zetelId}/leitura`}
            onLoad={postCurrentTheme}
          />
          <div style={{ display: chatOpen ? 'contents' : 'none' }}>
            <ChatPanel zetelId={zetelId} currentPageIndex={currentPageIndex} />
          </div>
        </div>
      )}
    </div>
  );
}
