'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPanel } from './ChatPanel';

const CHAT_WIDTH_KEY = 'zetel_chat_width';
const CHAT_WIDTH_DEFAULT = 360;
const CHAT_WIDTH_MIN = 280;
const CHAT_WIDTH_MAX = 520;

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
  selectedMode,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
  selectedMode: ReadingMode;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [building, setBuilding] = useState(false);
  const [buildingMode, setBuildingMode] = useState<ReadingMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsInfo | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return CHAT_WIDTH_DEFAULT;
    const saved = localStorage.getItem(CHAT_WIDTH_KEY);
    const n = saved ? parseInt(saved, 10) : NaN;
    return isNaN(n) ? CHAT_WIDTH_DEFAULT : Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, n));
  });
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);
  const chatWidthRef = useRef(chatWidth);
  useEffect(() => { chatWidthRef.current = chatWidth; }, [chatWidth]);
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
    setCurrentReadingMode(selectedMode);
    setCurrentPageIndex(null);
    setCurrentGuideBlockId(null);
    setCurrentGuideSectionId(null);
    setCurrentGuideBlockTitle(null);
    setCurrentGuideBlockIndex(null);
    setCurrentGuideBlockTotal(null);
  }, [selectedMode]);

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

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = chatWidthRef.current;
    setIsDragging(true);

    function onMove(ev: PointerEvent) {
      if (!draggingRef.current) return;
      const dx = dragStartXRef.current - ev.clientX;
      const newWidth = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, dragStartWidthRef.current + dx));
      setChatWidth(newWidth);
    }
    function onUp() {
      draggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidthRef.current)); } catch (_) {}
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

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
      <div className="leitura-toolbar" aria-hidden="true" />
      {showIframe && !chatOpen && (
        <button
          type="button"
          className="partner-toggle-btn"
          title="Abrir parceiro de estudos"
          aria-label="Abrir parceiro de estudos"
          onClick={() => setChatOpen(true)}
        >
          <svg viewBox="0 0 16 16">
            <rect x="2" y="2" width="12" height="10" rx="2"/>
            <path d="M5 13l1.5-2M11 13l-1.5-2" strokeLinecap="round"/>
          </svg>
          <span>Parceiro</span>
        </button>
      )}
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
              ? 'Guia de Estudo ainda não gerado.'
              : 'Documento Técnico ainda não construído.'}
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
            style={isDragging ? { pointerEvents: 'none' } : undefined}
          />
          <div
            inert={!chatOpen}
            aria-hidden={!chatOpen}
            style={{
              display: 'flex',
              width: chatOpen ? chatWidth : 0,
              minWidth: chatOpen ? CHAT_WIDTH_MIN : 0,
              maxWidth: chatOpen ? chatWidth : 0,
              flexShrink: 0,
              overflow: chatOpen ? 'visible' : 'hidden',
            }}
          >
            <div
              className="chat-resize-handle"
              onPointerDown={onHandlePointerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar painel do parceiro"
            />
            <div style={{ width: chatWidth, minWidth: CHAT_WIDTH_MIN, maxWidth: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
              <button
                type="button"
                className="partner-close-tab"
                title="Fechar parceiro"
                aria-label="Fechar parceiro"
                onClick={() => setChatOpen(false)}
              >
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
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
        </div>
      )}
    </div>
  );
}
