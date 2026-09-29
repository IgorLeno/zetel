import type { Metadata } from 'next';
import { getSetting } from '@/lib/settings';
import { getOpenRouterModel, resolveOpenRouterCredential } from '@/lib/config';
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
  const credentialSource = resolveOpenRouterCredential().source;
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
  const techDocModelHistory = parseModelHistory(getSetting('tech_doc_model_history'));
  const techDocModel = getSetting('tech_doc_model') ?? '';
  const chatModel = getSetting('chat_model') ?? '';
  const noteModel = getSetting('note_model') ?? '';
  const memoryModel = getSetting('memory_model') ?? '';
  const chatModelHistory = parseModelHistory(getSetting('chat_model_history'));
  const noteModelHistory = parseModelHistory(getSetting('note_model_history'));
  const memoryModelHistory = parseModelHistory(getSetting('memory_model_history'));

  return (
    <div className="page-body">
      <div className="content-narrow">
        <header className="page-hero">
          <h1 className="page-hero-title">Configurações</h1>
          <p className="page-hero-sub">Onde seus estudos moram, quais modelos usar e como o parceiro fala.</p>
        </header>
          <ConfiguracoesTabs
            initialVaultPath={vaultPath}
            credentialSource={credentialSource}
            initialModel={model}
            initialStudyGuideModel={studyGuideModel}
            initialTechDocModel={techDocModel}
            initialChatModel={chatModel}
            initialNoteModel={noteModel}
            initialMemoryModel={memoryModel}
            initialHistoryWindow={historyWindow}
            initialStudyGuideMaxTokens={studyGuideMaxTokens}
            initialStudyGuideTimeoutS={studyGuideTimeoutS}
            initialModelHistory={modelHistory}
            initialStudyGuideModelHistory={studyGuideModelHistory}
            initialTechDocModelHistory={techDocModelHistory}
            initialChatModelHistory={chatModelHistory}
            initialNoteModelHistory={noteModelHistory}
            initialMemoryModelHistory={memoryModelHistory}
          />
      </div>
    </div>
  );
}
