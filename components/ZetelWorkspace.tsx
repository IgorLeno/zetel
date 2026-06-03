'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArquivosPanel } from './ArquivosPanel';
import { LeituraPanel } from './LeituraPanel';
import { ArtefatosPanel } from './ArtefatosPanel';
import { NotasPanel } from './NotasPanel';

type ViewParam = 'tecnico' | 'guia-estudo' | 'arquivos' | 'notas-rapidas' | 'notas-literatura' | 'artefatos';

function isReadingView(view: ViewParam): view is 'tecnico' | 'guia-estudo' {
  return view === 'tecnico' || view === 'guia-estudo';
}

function WorkspaceView({
  zetelId,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  const searchParams = useSearchParams();
  const rawView = searchParams.get('view') ?? 'tecnico';
  const view = (['tecnico', 'guia-estudo', 'arquivos', 'notas-rapidas', 'notas-literatura', 'artefatos'] as const).includes(
    rawView as ViewParam,
  )
    ? (rawView as ViewParam)
    : 'tecnico';

  const selectedMode = isReadingView(view) ? view : 'tecnico';

  return (
    <div className="zetel-workspace">
      {/* LeituraPanel always mounted for tecnico/guia-estudo (M6-3: never unmount to preserve streams). */}
      <div style={{ display: isReadingView(view) ? 'contents' : 'none' }}>
        <LeituraPanel
          zetelId={zetelId}
          readingStale={readingStale}
          lastBuiltAt={lastBuiltAt}
          selectedMode={selectedMode}
        />
      </div>
      {view === 'arquivos' && <ArquivosPanel zetelId={zetelId} />}
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
      {view === 'artefatos' && <ArtefatosPanel zetelId={zetelId} />}
    </div>
  );
}

export function ZetelWorkspace({
  zetelId,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <WorkspaceView zetelId={zetelId} readingStale={readingStale} lastBuiltAt={lastBuiltAt} />
    </Suspense>
  );
}
