'use client';

import { useState } from 'react';

const TABS = [
  'Leitura ativa',
  'Arquivos',
  'Notas rápidas',
  'Notas de literatura',
  'Artefatos',
] as const;

/**
 * Shell das 5 abas internas do Zetel. No Módulo 2 os painéis são placeholders;
 * o conteúdo chega nos Módulos 3 (Arquivos), 4 (Leitura) e 7 (Notas).
 */
export function ZetelTabs() {
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
      <div className="empty-state">
        <div>{TABS[active]} — disponível em breve.</div>
      </div>
    </div>
  );
}
