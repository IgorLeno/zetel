'use client';

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArquivosPanel } from './ArquivosPanel';
import { LeituraPanel } from './LeituraPanel';
import { ArtefatosPanel } from './ArtefatosPanel';
import { NotasPanel } from './NotasPanel';
import { PdfStudyView } from './PdfStudyView';
import { PartnerSheet } from './PartnerSheet';

type ReadingView = 'tecnico' | 'guia-estudo';
export type DrawerView =
  | 'arquivos'
  | 'notas-rapidas'
  | 'notas-literatura'
  | 'notas-elaboradas'
  | 'notas-do-usuario'
  | 'artefatos';

const DRAWER_VIEWS: readonly DrawerView[] = [
  'arquivos', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'artefatos',
];

const NOTE_TABS: { view: DrawerView; label: string; tipo: 'rapida' | 'literatura' | 'elaborada' | 'minha-nota' }[] = [
  { view: 'notas-rapidas', label: 'Rápidas', tipo: 'rapida' },
  { view: 'notas-literatura', label: 'Literatura', tipo: 'literatura' },
  { view: 'notas-elaboradas', label: 'Elaboradas', tipo: 'elaborada' },
  { view: 'notas-do-usuario', label: 'Minhas', tipo: 'minha-nota' },
];

function isDrawerView(value: string | null): value is DrawerView {
  return value !== null && (DRAWER_VIEWS as readonly string[]).includes(value);
}

function WorkspaceView({
  zetelId,
  hasSources,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  hasSources: boolean;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const rawView = searchParams.get('view') ?? 'tecnico';
  // `view` antigo com nome de gaveta (links salvos) abre a gaveta sobre a leitura.
  const legacyDrawer = isDrawerView(rawView) ? rawView : null;
  const rawPanel = searchParams.get('painel');
  const drawer: DrawerView | null = isDrawerView(rawPanel) ? rawPanel : legacyDrawer;
  const view: ReadingView | 'pdf' = rawView === 'pdf' ? 'pdf'
    : rawView === 'guia-estudo' ? 'guia-estudo' : 'tecnico';
  const pdfFileId = view === 'pdf' ? searchParams.get('file') : null;

  const drawerHref = useCallback((next: DrawerView | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (isDrawerView(params.get('view'))) params.set('view', 'tecnico');
    if (next) params.set('painel', next);
    else params.delete('painel');
    const qs = params.toString();
    return `${pathname}${qs ? `?${qs}` : ''}`;
  }, [pathname, searchParams]);

  const closeDrawer = useCallback(() => router.replace(drawerHref(null), { scroll: false }), [drawerHref, router]);

  if (!hasSources) {
    return (
      <div className="zetel-workspace">
        <ArquivosPanel zetelId={zetelId} onboarding />
      </div>
    );
  }

  const noteTab = NOTE_TABS.find((tab) => tab.view === drawer);

  return (
    <div className="zetel-workspace">
      {/* LeituraPanel always mounted (M6-3: never unmount to preserve streams); drawer overlays it. */}
      <div style={{ display: view === 'pdf' ? 'none' : 'contents' }}>
        <LeituraPanel
          zetelId={zetelId}
          readingStale={readingStale}
          lastBuiltAt={lastBuiltAt}
          selectedMode={view === 'pdf' ? 'tecnico' : view}
          chatActive={view !== 'pdf'}
        />
      </div>
      {view === 'pdf' && (pdfFileId ? (
        <PdfStudyView key={pdfFileId} zetelId={zetelId} fileId={pdfFileId} />
      ) : (
        <p className="feedback err">Nenhum PDF selecionado. Abra um PDF em Fontes & notas.</p>
      ))}

      {drawer && (
        <PartnerSheet title="Fontes, notas e artefatos" subtitle="Tudo deste estudo, sem sair da conversa." onClose={closeDrawer} wide>
          <nav className="drawer-tabs" aria-label="Seções do estudo">
            <Link replace scroll={false} href={drawerHref('arquivos')} className={drawer === 'arquivos' ? 'on' : ''}>Fontes</Link>
            <Link replace scroll={false} href={drawerHref(noteTab ? noteTab.view : 'notas-rapidas')} className={noteTab ? 'on' : ''}>Notas</Link>
            <Link replace scroll={false} href={drawerHref('artefatos')} className={drawer === 'artefatos' ? 'on' : ''}>Artefatos</Link>
          </nav>
          {noteTab && (
            <nav className="drawer-subtabs" aria-label="Tipos de nota">
              {NOTE_TABS.map((tab) => (
                <Link key={tab.view} replace scroll={false} href={drawerHref(tab.view)} className={tab.view === drawer ? 'on' : ''}>
                  {tab.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="drawer-content">
            {drawer === 'arquivos' && <ArquivosPanel zetelId={zetelId} />}
            {noteTab && (
              <div data-testid={`${noteTab.view}-panel`}>
                <NotasPanel key={noteTab.tipo} zetelId={zetelId} tipo={noteTab.tipo} />
              </div>
            )}
            {drawer === 'artefatos' && <ArtefatosPanel zetelId={zetelId} />}
          </div>
        </PartnerSheet>
      )}
    </div>
  );
}

export function ZetelWorkspace(props: {
  zetelId: string;
  hasSources: boolean;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <WorkspaceView {...props} />
    </Suspense>
  );
}

/** Botão da barra do Zetel que abre a gaveta de fontes e notas. */
function DrawerButtonInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const params = new URLSearchParams(searchParams.toString());
  const open = isDrawerView(params.get('painel'));
  params.set('painel', 'arquivos');
  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={`topbar-btn${open ? ' on' : ''}`}>
      <svg viewBox="0 0 16 16" aria-hidden><path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" /></svg>
      <span>Fontes & notas</span>
    </Link>
  );
}

export function StudyDrawerButton() {
  return (
    <Suspense fallback={null}>
      <DrawerButtonInner />
    </Suspense>
  );
}
