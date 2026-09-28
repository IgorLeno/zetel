'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArquivosPanel } from './ArquivosPanel';
import { LeituraPanel } from './LeituraPanel';
import { ArtefatosPanel } from './ArtefatosPanel';
import { NotasPanel } from './NotasPanel';
import { PdfStudyView } from './PdfStudyView';

type ViewParam = 'tecnico' | 'guia-estudo' | 'arquivos' | 'pdf' | 'notas-rapidas' | 'notas-literatura' | 'notas-elaboradas' | 'notas-do-usuario' | 'artefatos';

function isReadingView(view: ViewParam): view is 'tecnico' | 'guia-estudo' {
  return view === 'tecnico' || view === 'guia-estudo';
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
  const rawView = searchParams.get('view') ?? 'tecnico';
  const view = (['tecnico', 'guia-estudo', 'arquivos', 'pdf', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'artefatos'] as const).includes(
    rawView as ViewParam,
  )
    ? (rawView as ViewParam)
    : 'tecnico';

  const selectedMode = isReadingView(view) ? view : 'tecnico';
  const pdfFileId = view === 'pdf' ? searchParams.get('file') : null;

  if (!hasSources && isReadingView(view)) {
    return (
      <div className="zetel-workspace">
        <ArquivosPanel zetelId={zetelId} onboarding />
      </div>
    );
  }

  return (
    <div className="zetel-workspace">
      {/* LeituraPanel always mounted for tecnico/guia-estudo (M6-3: never unmount to preserve streams). */}
      <div style={{ display: isReadingView(view) ? 'contents' : 'none' }}>
        <LeituraPanel
          zetelId={zetelId}
          readingStale={readingStale}
          lastBuiltAt={lastBuiltAt}
          selectedMode={selectedMode}
          chatActive={isReadingView(view)}
        />
      </div>
      {view === 'arquivos' && <ArquivosPanel zetelId={zetelId} />}
      {view === 'pdf' &&
        (pdfFileId ? (
          <PdfStudyView key={pdfFileId} zetelId={zetelId} fileId={pdfFileId} />
        ) : (
          <p className="feedback err">Nenhum PDF selecionado. Abra um PDF pela aba Arquivos.</p>
        ))}
      {view === 'notas-rapidas' && (
        <div data-testid="notas-rapidas-panel">
          <NotasPanel zetelId={zetelId} tipo="rapida" />
        </div>
      )}
      {view === 'notas-literatura' && (
        <div data-testid="notas-literatura-panel">
          <NotasPanel zetelId={zetelId} tipo="literatura" />
        </div>
      )}
      {view === 'notas-elaboradas' && (
        <div data-testid="notas-elaboradas-panel">
          <NotasPanel zetelId={zetelId} tipo="elaborada" />
        </div>
      )}
      {view === 'notas-do-usuario' && (
        <div data-testid="notas-do-usuario-panel">
          <NotasPanel zetelId={zetelId} tipo="minha-nota" />
        </div>
      )}
      {view === 'artefatos' && <ArtefatosPanel zetelId={zetelId} />}
    </div>
  );
}

export function ZetelWorkspace({
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
  return (
    <Suspense fallback={null}>
      <WorkspaceView
        zetelId={zetelId}
        hasSources={hasSources}
        readingStale={readingStale}
        lastBuiltAt={lastBuiltAt}
      />
    </Suspense>
  );
}
