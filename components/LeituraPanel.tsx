'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPanel } from './ChatPanel';

type ReadingMode = 'tecnico' | 'guia-estudo';

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
    model: string | null;
    generatedAt: string | null;
    counts: {
      cards: number;
      secoes: number;
      glossario: number;
      quiz: number;
      zettelkasten: number;
    } | null;
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
  const [buildingMode, setBuildingMode] = useState<ReadingMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<ReadingMode>('tecnico');
  const [chatOpen, setChatOpen] = useState(false);
  const [currentReadingMode, setCurrentReadingMode] = useState<ReadingMode>('tecnico');
  const [currentPageIndex, setCurrentPageIndex] = useState<number | null>(null);
  const [currentGuideBlockId, setCurrentGuideBlockId] = useState<string | null>(null);
  const [currentGuideSectionId, setCurrentGuideSectionId] = useState<string | null>(null);
  const [currentGuideBlockTitle, setCurrentGuideBlockTitle] = useState<string | null>(null);
  const [currentGuideBlockIndex, setCurrentGuideBlockIndex] = useState<number | null>(null);
  const [currentGuideBlockTotal, setCurrentGuideBlockTotal] = useState<number | null>(null);
  // Força recarregar o iframe após gerar/atualizar (mesmo quando o src não muda).
  const [reloadNonce, setReloadNonce] = useState(0);

  const tecnicoBuilt = lastBuiltAt !== null || artifacts?.documentoTecnico.exists === true;
  const guiaBuilt = artifacts?.guiaEstudo.exists === true;
  const anyBuilt = tecnicoBuilt || guiaBuilt;

  // O modo selecionado é, ao mesmo tempo, o alvo de geração e o artefato exibido
  // (a alternância entre Documento Técnico e Guia de Estudo é o próprio seletor).
  const viewArtifact: ReadingMode | null =
    selectedMode === 'guia-estudo'
      ? guiaBuilt
        ? 'guia-estudo'
        : null
      : tecnicoBuilt
        ? 'tecnico'
        : null;

  const showIframe = anyBuilt && !building && viewArtifact !== null;

  const buttonLabel =
    selectedMode === 'guia-estudo'
      ? guiaBuilt
        ? 'Regenerar Guia de Estudo'
        : 'Gerar Guia de Estudo'
      : tecnicoBuilt
        ? 'Atualizar leitura'
        : 'Preparar leitura';
  const buttonPrimary =
    selectedMode === 'guia-estudo' ? !guiaBuilt : !tecnicoBuilt || readingStale;

  const iframeSrc = (() => {
    const params = new URLSearchParams();
    if (viewArtifact === 'guia-estudo') params.set('artifact', 'guia-estudo');
    if (reloadNonce) params.set('v', String(reloadNonce));
    const qs = params.toString();
    return `/api/zetels/${zetelId}/leitura${qs ? `?${qs}` : ''}`;
  })();

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/zetels/${zetelId}/artifacts`);
      const data = await res.json();
      if (res.ok) setArtifacts(data);
    } catch {
      // A rota de leitura ainda mostra erro próprio se o usuário tentar abrir sem artefato.
    }
  }, [zetelId]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'zetel:page-change') {
        const readingMode = e.data.readingMode === 'guia-estudo' ? 'guia-estudo' : 'tecnico';
        setCurrentReadingMode(readingMode);
        if (typeof e.data.pageIndex === 'number') setCurrentPageIndex(e.data.pageIndex);
        if (readingMode === 'guia-estudo') {
          setCurrentGuideBlockId(
            typeof e.data.guideBlockId === 'string' ? e.data.guideBlockId : null,
          );
          setCurrentGuideSectionId(
            typeof e.data.guideSectionId === 'string' ? e.data.guideSectionId : null,
          );
          setCurrentGuideBlockTitle(
            typeof e.data.guideBlockTitle === 'string' ? e.data.guideBlockTitle : null,
          );
          setCurrentGuideBlockIndex(
            typeof e.data.guideBlockIndex === 'number' ? e.data.guideBlockIndex : null,
          );
          setCurrentGuideBlockTotal(
            typeof e.data.guideBlockTotal === 'number' ? e.data.guideBlockTotal : null,
          );
        } else {
          setCurrentGuideBlockId(null);
          setCurrentGuideSectionId(null);
          setCurrentGuideBlockTitle(null);
          setCurrentGuideBlockIndex(null);
          setCurrentGuideBlockTotal(null);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (viewArtifact) setCurrentReadingMode(viewArtifact);
    setCurrentPageIndex(null);
    setCurrentGuideBlockId(null);
    setCurrentGuideSectionId(null);
    setCurrentGuideBlockTitle(null);
    setCurrentGuideBlockIndex(null);
    setCurrentGuideBlockTotal(null);
  }, [viewArtifact]);

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
    const mode = selectedMode;
    setBuilding(true);
    setBuildingMode(mode);
    setError(null);
    try {
      const qs = mode === 'guia-estudo' ? '?mode=guia-estudo' : '';
      const res = await fetch(`/api/zetels/${zetelId}/build${qs}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao construir a leitura.');
        return;
      }
      await loadArtifacts();
      router.refresh();
      setReloadNonce(Date.now());
    } catch {
      setError('Erro de rede ao construir a leitura.');
    } finally {
      setBuilding(false);
      setBuildingMode(null);
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
            disabled={building}
            onClick={() => setSelectedMode('tecnico')}
          >
            Documento Técnico
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === 'guia-estudo'}
            className={`mode-option${selectedMode === 'guia-estudo' ? ' active' : ''}`}
            disabled={building}
            title="Gerado por IA a partir do material"
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
          {building
            ? buildingMode === 'guia-estudo'
              ? 'Gerando guia…'
              : 'Construindo…'
            : buttonLabel}
        </button>
        {showIframe && (
          <button type="button" className="btn" onClick={() => setChatOpen((o) => !o)}>
            {chatOpen ? 'Fechar chat' : 'Interagir'}
          </button>
        )}
        {selectedMode === 'tecnico' && tecnicoBuilt && !readingStale && !building && (
          <span className="feedback ok">Leitura pronta para uso.</span>
        )}
        {selectedMode === 'guia-estudo' && guiaBuilt && !building && (
          <span className="feedback ok">Guia de estudo pronto.</span>
        )}
      </div>
      {error && <p className="feedback err">{error}</p>}

      {!anyBuilt && !building ? (
        <div className="empty-state leitura-empty">
          <div>Nenhuma leitura construída ainda.</div>
        </div>
      ) : building ? (
        <div className="empty-state leitura-empty">
          <div>
            {buildingMode === 'guia-estudo'
              ? 'Gerando guia de estudo com IA… isso pode levar até um minuto.'
              : 'Gerando HTML de leitura…'}
          </div>
        </div>
      ) : viewArtifact === null ? (
        <div className="empty-state leitura-empty">
          <div>
            {selectedMode === 'guia-estudo'
              ? 'Guia de Estudo ainda não gerado. Use o botão acima para gerá-lo.'
              : 'Documento Técnico ainda não construído. Use o botão acima.'}
          </div>
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
            src={iframeSrc}
            onLoad={postCurrentTheme}
          />
          <div style={{ display: chatOpen ? 'contents' : 'none' }}>
            <ChatPanel
              zetelId={zetelId}
              currentReadingMode={currentReadingMode}
              currentPageIndex={currentPageIndex}
              currentGuideBlockId={currentGuideBlockId}
              currentGuideSectionId={currentGuideSectionId}
              currentGuideBlockTitle={currentGuideBlockTitle}
              currentGuideBlockIndex={currentGuideBlockIndex}
              currentGuideBlockTotal={currentGuideBlockTotal}
            />
          </div>
        </div>
      )}
    </div>
  );
}
