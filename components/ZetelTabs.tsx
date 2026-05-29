'use client';

import { useState } from 'react';
import { ArquivosPanel } from './ArquivosPanel';
import { LeituraPanel } from './LeituraPanel';
import { ArtefatosPanel } from './ArtefatosPanel';

const TABS = [
  'Leitura ativa',
  'Arquivos',
  'Notas rápidas',
  'Notas de literatura',
  'Artefatos',
] as const;

export function ZetelTabs({
  zetelId,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className="zetel-tabs">
      <div className="tabs">
        {TABS.map((label, i) => (
          <button
            key={label}
            className={`tab${active === i ? ' active' : ''}`}
            type="button"
            onClick={() => setActive(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="zetel-tab-panel">
        {active === 0 && (
          <LeituraPanel
            zetelId={zetelId}
            readingStale={readingStale}
            lastBuiltAt={lastBuiltAt}
          />
        )}
        {active === 1 && <ArquivosPanel zetelId={zetelId} />}
        {active === 2 && (
          <div className="empty-state">
            <div>{TABS[2]} — disponível em breve.</div>
          </div>
        )}
        {active === 3 && (
          <div className="empty-state">
            <div>{TABS[3]} — disponível em breve.</div>
          </div>
        )}
        {active === 4 && <ArtefatosPanel zetelId={zetelId} />}
      </div>
    </div>
  );
}
