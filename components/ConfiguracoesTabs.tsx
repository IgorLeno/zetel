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
  initialTechDocModel,
  initialChatModel,
  initialNoteModel,
  initialMemoryModel,
  initialHistoryWindow,
  initialStudyGuideMaxTokens,
  initialStudyGuideTimeoutS,
  initialModelHistory,
  initialStudyGuideModelHistory,
  initialTechDocModelHistory,
  initialChatModelHistory,
  initialNoteModelHistory,
  initialMemoryModelHistory,
}: {
  initialVaultPath: string;
  hasKey: boolean;
  initialModel: string;
  initialStudyGuideModel: string;
  initialTechDocModel: string;
  initialChatModel: string;
  initialNoteModel: string;
  initialMemoryModel: string;
  initialHistoryWindow: number;
  initialStudyGuideMaxTokens: number;
  initialStudyGuideTimeoutS: number;
  initialModelHistory: string[];
  initialStudyGuideModelHistory: string[];
  initialTechDocModelHistory: string[];
  initialChatModelHistory: string[];
  initialNoteModelHistory: string[];
  initialMemoryModelHistory: string[];
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
          initialTechDocModel={initialTechDocModel}
          initialChatModel={initialChatModel}
          initialNoteModel={initialNoteModel}
          initialMemoryModel={initialMemoryModel}
          initialHistoryWindow={initialHistoryWindow}
          initialStudyGuideMaxTokens={initialStudyGuideMaxTokens}
          initialStudyGuideTimeoutS={initialStudyGuideTimeoutS}
          initialModelHistory={initialModelHistory}
          initialStudyGuideModelHistory={initialStudyGuideModelHistory}
          initialTechDocModelHistory={initialTechDocModelHistory}
          initialChatModelHistory={initialChatModelHistory}
          initialNoteModelHistory={initialNoteModelHistory}
          initialMemoryModelHistory={initialMemoryModelHistory}
        />
      ) : (
        <LixeiraPanel />
      )}
    </div>
  );
}
