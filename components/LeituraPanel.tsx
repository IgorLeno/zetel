'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PartnerColor } from '@/lib/partner-identity';
import { ChatPanel } from './ChatPanel';
import { ChatGptStudyCard } from './ChatGptStudyCard';
import { StudyDrawerButton } from './StudyDrawerButton';
import { StudyShell } from './StudyShell';
import { originalReadingQuery } from '@/lib/reading-links';
import { BUILD_STEP_LABEL, buildStepUrl, planBuildSteps, type BuildStep } from '@/lib/reading-build-plan';

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
  slug,
  readingStale,
  lastBuiltAt,
  selectedMode,
  chatActive = true,
  originalPdfId = null,
}: {
  zetelId: string;
  slug: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
  selectedMode: ReadingMode;
  chatActive?: boolean;
  /** Primeiro PDF do Zetel: é o "Original". Sem PDF, o original é o Documento Técnico. */
  originalPdfId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [partnerColor, setPartnerColor] = useState<PartnerColor | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<BuildStep | null>(null);
  // Centro da tela: o estudo pelo ChatGPT (padrão) ou o chat interno antigo.
  const [centerView, setCenterView] = useState<'chatgpt' | 'interno'>('chatgpt');
  // O chat interno só monta quando pedido e depois fica montado (streams sobrevivem à troca).
  const [internalChatMounted, setInternalChatMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsInfo | null>(null);
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

  function modeHref(mode: ReadingMode) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', mode);
    return `${pathname}?${params.toString()}`;
  }

  const originalHref = `${pathname}?${originalReadingQuery(searchParams.toString(), originalPdfId)}`;

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

  /** Um clique faz a sequência inteira: processar fontes → documento → guia (o que faltar). */
  async function onBuild() {
    const steps = planBuildSteps({ mode: selectedMode, readingStale, tecnicoBuilt });
    setBuilding(true);
    setError(null);
    let changed = false;
    try {
      for (const step of steps) {
        setBuildStep(step);
        const res = await fetch(buildStepUrl(zetelId, step), { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? (step === 'process' ? 'Falha ao processar as fontes.' : 'Falha ao construir a leitura.'));
          return;
        }
        changed = true;
      }
    } catch {
      setError('Erro de rede ao construir a leitura.');
    } finally {
      if (changed) {
        await loadArtifacts();
        router.refresh();
        setReloadNonce(Date.now());
      }
      setBuilding(false);
      setBuildStep(null);
    }
  }

  function openInternalChat() {
    setInternalChatMounted(true);
    setCenterView('interno');
  }

  const modeLabel = selectedMode === 'guia-estudo' ? 'Guia de estudo' : 'Documento técnico';
  const modeExists = selectedMode === 'guia-estudo' ? guiaBuilt : tecnicoBuilt;

  return (
    <div className="leitura-panel">
      {error && <p className="feedback err">{error}</p>}

      {/* Both surfaces remain mounted when the material is collapsed, including ongoing chat streams. */}
      <StudyShell
        materialLabel="Material"
        partnerColor={partnerColor}
        materialTabs={
          <nav className="material-seg" aria-label="Material de leitura">
            <Link href={modeHref('guia-estudo')} className={selectedMode === 'guia-estudo' ? 'on' : ''}
              aria-current={selectedMode === 'guia-estudo' ? 'page' : undefined}>Guia de estudo</Link>
            <Link href={originalHref} className={selectedMode === 'tecnico' ? 'on' : ''}
              aria-current={selectedMode === 'tecnico' ? 'page' : undefined}>Original</Link>
            {readingStale && selectedMode === 'tecnico' && tecnicoBuilt && !building && (
              <span className="pill warn" title="As fontes mudaram desde a última montagem">Fontes mudaram</span>
            )}
            {modeExists && !building && (
              <button type="button" className="material-regen" onClick={() => void onBuild()}
                title={`Gerar ${modeLabel.toLowerCase()} de novo`} aria-label={`Gerar ${modeLabel.toLowerCase()} de novo`}>
                <svg viewBox="0 0 16 16" aria-hidden><path d="M13 4v3h-3" strokeLinecap="round" strokeLinejoin="round"/><path d="M12.6 7A5 5 0 1 0 13 10" strokeLinecap="round"/></svg>
              </button>
            )}
          </nav>
        }
        reader={building ? (
          <div className="empty-state leitura-empty">
            <span className="material-spinner" aria-hidden />
            <p>{BUILD_STEP_LABEL[buildStep ?? 'tecnico']}</p>
          </div>
        ) : viewArtifact === null ? (
          <div className="empty-state leitura-empty">
            <p className="leitura-empty-title">
              {selectedMode === 'guia-estudo' ? 'Ainda não há guia de estudo' : 'Ainda não há documento de leitura'}
            </p>
            <p>
              {selectedMode === 'guia-estudo'
                ? 'Um roteiro com seções, glossário e perguntas, feito a partir das suas fontes.'
                : 'Suas fontes organizadas em páginas para ler ao lado da conversa.'}
            </p>
            <button type="button" className="btn primary" onClick={() => void onBuild()}>
              {selectedMode === 'guia-estudo' ? 'Gerar guia de estudo' : 'Montar documento'}
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="leitura-iframe"
            title="Leitura do Zetel"
            sandbox="allow-scripts"
            src={iframeSrc}
            onLoad={postCurrentTheme}
          />
        )}
        chat={<>
          <div style={{ display: centerView === 'chatgpt' ? 'contents' : 'none' }}>
            <ChatGptStudyCard zetelId={zetelId} slug={slug} onUseInternalChat={openInternalChat} />
          </div>
          {internalChatMounted && (
            <div style={{ display: centerView === 'interno' ? 'contents' : 'none' }}>
              <ChatPanel
                zetelId={zetelId}
                active={chatActive}
                currentReadingMode={currentReadingMode}
                currentPageIndex={currentPageIndex}
                currentGuideBlockId={currentGuideBlockId}
                currentGuideSectionId={currentGuideSectionId}
                currentGuideBlockTitle={currentGuideBlockTitle}
                currentGuideBlockIndex={currentGuideBlockIndex}
                currentGuideBlockTotal={currentGuideBlockTotal}
                onPartnerColorChange={setPartnerColor}
                headerActions={<>
                  <StudyDrawerButton className="topbar-btn chat-drawer-btn" />
                  <button type="button" className="chat-back-chatgpt" onClick={() => setCenterView('chatgpt')}>
                    Estudar com o ChatGPT
                  </button>
                </>}
              />
            </div>
          )}
        </>}
      />
    </div>
  );
}
