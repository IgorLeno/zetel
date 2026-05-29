'use client';

import { useState } from 'react';
import { ArquivosPanel } from './ArquivosPanel';

const TABS = [
  'Leitura ativa',
  'Arquivos',
  'Notas rápidas',
  'Notas de literatura',
  'Artefatos',
] as const;

/**
 * Shell das 5 abas internas do Zetel. A aba "Arquivos" ganha conteúdo no
 * Módulo 3; as demais chegam nos Módulos 4 (Leitura) e 7 (Notas).
 */
export function ZetelTabs({ zetelId }: { zetelId: string }) {
  const [active, setActive] = useState(0);

  return (
    <div>
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
      {active === 1 ? (
        <ArquivosPanel zetelId={zetelId} />
      ) : (
        <div className="empty-state">
          <div>{TABS[active]} — disponível em breve.</div>
        </div>
      )}
    </div>
  );
}
