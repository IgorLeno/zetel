import type { Metadata } from 'next';
import { getSetting } from '@/lib/settings';
import { getOpenRouterKey, getOpenRouterModel } from '@/lib/config';
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
    ? Math.min(32000, Math.max(4000, Number.parseInt(rawMaxTokens, 10) || 16000))
    : 16000;
  const rawTimeout = getSetting('study_guide_timeout_s');
  const studyGuideTimeoutS = rawTimeout
    ? Math.min(300, Math.max(30, Number.parseInt(rawTimeout, 10) || 120))
    : 120;

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
          />
        </div>
      </div>
    </>
  );
}
