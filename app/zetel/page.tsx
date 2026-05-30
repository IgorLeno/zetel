import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { listZetels } from '@/lib/zetel-service';
import { ZetelList } from '@/components/ZetelList';

export const dynamic = 'force-dynamic'; // lê estado vivo do SQLite a cada visita

export const metadata: Metadata = { title: 'Zetels' };

export default function ZetelPage() {
  const vaultPath = getSetting('vault_path');

  return (
    <>
      <header className="page-header">
        <span className="page-title">Zetels</span>
      </header>
      <div className="page-body">
        {!vaultPath ? (
          <div className="empty-state">
            <div>Configure o caminho do vault antes de criar Zetels.</div>
            <Link className="btn primary" href="/configuracoes">
              Ir para Configurações
            </Link>
          </div>
        ) : (
          <ZetelList initial={listZetels(getDb())} />
        )}
      </div>
    </>
  );
}
