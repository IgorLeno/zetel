import type { Metadata } from 'next';
import { getSetting } from '@/lib/settings';
import { getOpenRouterKey, getOpenRouterModel } from '@/lib/config';
import { parseModelHistory } from '@/lib/model-history';
import {
  clampStudyGuideMaxTokens,
  clampStudyGuideTimeoutS,
  DEFAULT_STUDY_GUIDE_MAX_TOKENS,
  DEFAULT_STUDY_GUIDE_TIMEOUT_S,
} from '@/lib/study-guide-constants';
import { ConfiguracoesTabs } from '@/components/ConfiguracoesTabs';

export const dynamic = 'force-dynamic'; // lê estado vivo (SQLite + config) a cada visita

export const metadata: Metadata = { title: 'Configurações' };

export default function ConfiguracoesPage() {
  const vaultPath = getSetting('vault_path') ?? '';
  const hasKey = getOpenRouterKey() !== null;
  const model = getSetting('default_model') ?? getOpenRouterModel();
  const studyGuideModel = getSetting('study_guide_model') ?? '';
  const rawWindow = getSetting('chat_history_window');
  const historyWindow = rawWindow
    ? Math.min(50, Math.max(1, Number.parseInt(rawWindow, 10) || 10))
    : 10;
  const rawMaxTokens = getSetting('study_guide_max_tokens');
  const studyGuideMaxTokens = rawMaxTokens
    ? clampStudyGuideMaxTokens(Number.parseInt(rawMaxTokens, 10))
    : DEFAULT_STUDY_GUIDE_MAX_TOKENS;
  const rawTimeout = getSetting('study_guide_timeout_s');
  const studyGuideTimeoutS = rawTimeout
    ? clampStudyGuideTimeoutS(Number.parseInt(rawTimeout, 10))
    : DEFAULT_STUDY_GUIDE_TIMEOUT_S;
  const modelHistory = parseModelHistory(getSetting('model_history'));
  const studyGuideModelHistory = parseModelHistory(getSetting('study_guide_model_history'));

  return (
    <>
      <header className="page-header">
        <span className="page-title">Configurações</span>
      </header>
      <div className="page-body">
        <div className="content-narrow">
          <ConfiguracoesTabs
            initialVaultPath={vaultPath}
            hasKey={hasKey}
            initialModel={model}
            initialStudyGuideModel={studyGuideModel}
            initialHistoryWindow={historyWindow}
            initialStudyGuideMaxTokens={studyGuideMaxTokens}
            initialStudyGuideTimeoutS={studyGuideTimeoutS}
            initialModelHistory={modelHistory}
            initialStudyGuideModelHistory={studyGuideModelHistory}
          />
        </div>
      </div>
    </>
  );
}
