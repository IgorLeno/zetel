'use client';

import { useState } from 'react';
import { ConfiguracoesForm } from './ConfiguracoesForm';
import { LixeiraPanel } from './LixeiraPanel';

type Tab = 'geral' | 'lixeira';

export function ConfiguracoesTabs({
  initialVaultPath,
  hasKey,
  initialModel,
  initialStudyGuideModel,
  initialHistoryWindow,
  initialStudyGuideMaxTokens,
  initialStudyGuideTimeoutS,
  initialModelHistory,
  initialStudyGuideModelHistory,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialStudyGuideModel: string;
  initialHistoryWindow: number;
  initialStudyGuideMaxTokens: number;
  initialStudyGuideTimeoutS: number;
  initialModelHistory: string[];
  initialStudyGuideModelHistory: string[];
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
          initialStudyGuideModel={initialStudyGuideModel}
          initialHistoryWindow={initialHistoryWindow}
          initialStudyGuideMaxTokens={initialStudyGuideMaxTokens}
          initialStudyGuideTimeoutS={initialStudyGuideTimeoutS}
          initialModelHistory={initialModelHistory}
          initialStudyGuideModelHistory={initialStudyGuideModelHistory}
        />
      ) : (
        <LixeiraPanel />
      )}
    </div>
  );
}
