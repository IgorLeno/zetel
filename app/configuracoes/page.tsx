import { getSetting } from '@/lib/settings';
import { getOpenRouterKey, getOpenRouterModel } from '@/lib/config';
import { ConfiguracoesTabs } from '@/components/ConfiguracoesTabs';

export const dynamic = 'force-dynamic'; // lê estado vivo (SQLite + config) a cada visita

export default function ConfiguracoesPage() {
  const vaultPath = getSetting('vault_path') ?? '';
  const hasKey = getOpenRouterKey() !== null;
  const model = getOpenRouterModel();

  return (
    <>
      <header className="page-header">
        <span className="page-title">Configurações</span>
      </header>
      <div className="page-body">
        <div className="content-narrow">
          <ConfiguracoesTabs initialVaultPath={vaultPath} hasKey={hasKey} initialModel={model} />
        </div>
      </div>
    </>
  );
}
