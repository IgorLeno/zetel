'use client';

import { useState } from 'react';
import { ConfiguracoesForm } from './ConfiguracoesForm';
import { LixeiraPanel } from './LixeiraPanel';

type Tab = 'geral' | 'lixeira';

export function ConfiguracoesTabs({
  initialVaultPath,
  hasKey,
  initialModel,
  initialHistoryWindow,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialHistoryWindow: number;
}) {
  const [tab, setTab] = useState<Tab>('geral');

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab${tab === 'geral' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('geral')}
        >
          Geral
        </button>
        <button
          className={`tab${tab === 'lixeira' ? ' active' : ''}`}
          type="button"
          onClick={() => setTab('lixeira')}
        >
          Lixeira
        </button>
      </div>

      {tab === 'geral' ? (
        <ConfiguracoesForm
          initialVaultPath={initialVaultPath}
          hasKey={hasKey}
          initialModel={initialModel}
          initialHistoryWindow={initialHistoryWindow}
        />
      ) : (
        <LixeiraPanel />
      )}
    </div>
  );
}
