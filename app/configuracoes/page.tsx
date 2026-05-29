import { getSetting } from '@/lib/settings';
import { getOpenRouterKey, getOpenRouterModel } from '@/lib/config';
import { ConfiguracoesTabs } from '@/components/ConfiguracoesTabs';

export const dynamic = 'force-dynamic'; // lê estado vivo (SQLite + config) a cada visita

export default function ConfiguracoesPage() {
  const vaultPath = getSetting('vault_path') ?? '';
  const hasKey = getOpenRouterKey() !== null;
  const model = getSetting('default_model') ?? getOpenRouterModel();
  const rawWindow = getSetting('chat_history_window');
  const historyWindow = rawWindow
    ? Math.min(50, Math.max(1, Number.parseInt(rawWindow, 10) || 10))
    : 10;

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
            initialHistoryWindow={historyWindow}
          />
        </div>
      </div>
    </>
  );
}
