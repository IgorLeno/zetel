import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { listZetels } from '@/lib/zetel-service';
import { ZetelList, type ZetelStats } from '@/components/ZetelList';
import { HomeGreeting } from '@/components/HomeGreeting';

export const dynamic = 'force-dynamic'; // lê estado vivo do SQLite a cada visita

export const metadata: Metadata = { title: 'Estudos' };

/** Só contagens e datas: nada de conteúdo do usuário sai daqui. */
function loadStats(): Record<string, ZetelStats> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT z.id AS id,
      (SELECT COUNT(*) FROM zetel_files f WHERE f.zetel_id = z.id) AS sources,
      (SELECT COUNT(*) FROM study_sessions s WHERE s.zetel_id = z.id AND s.status != 'archived') AS sessions,
      (SELECT MAX(s.last_active_at) FROM study_sessions s WHERE s.zetel_id = z.id) AS lastActiveAt
    FROM zetels z WHERE z.trashed_at IS NULL
  `).all() as { id: string; sources: number; sessions: number; lastActiveAt: string | null }[];
  return Object.fromEntries(rows.map(({ id, ...stats }) => [id, stats]));
}

export default function ZetelPage() {
  const vaultPath = getSetting('vault_path');

  if (!vaultPath) {
    return (
      <div className="page-body page-body--wide">
        <HomeGreeting resume={null} />
        <div className="home-setup">
          <p>Antes de começar, diga onde fica o seu vault do Obsidian — é lá que seus estudos vão morar.</p>
          <Link className="btn primary" href="/configuracoes">Configurar vault</Link>
        </div>
      </div>
    );
  }

  const zetels = listZetels(getDb());
  const stats = loadStats();
  const lastTouched = [...zetels].sort((a, b) => {
    const at = stats[a.id]?.lastActiveAt ?? a.updatedAt;
    const bt = stats[b.id]?.lastActiveAt ?? b.updatedAt;
    return bt.localeCompare(at);
  })[0] ?? null;

  return (
    <div className="page-body page-body--wide">
      <HomeGreeting resume={lastTouched ? { slug: lastTouched.slug, name: lastTouched.displayName } : null} />
      <ZetelList initial={zetels} stats={stats} />
    </div>
  );
}
