import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getZetelBySlug } from '@/lib/zetel-service';
import { ZetelTabs } from '@/components/ZetelTabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const zetel = getZetelBySlug(getDb(), slug);
  return { title: zetel?.displayName ?? 'Zetel' };
}

export default async function ZetelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const zetel = getZetelBySlug(getDb(), slug);

  if (!zetel || zetel.trashedAt) {
    return (
      <>
        <header className="page-header">
          <Link className="back-link" href="/zetel">
            ← Zetels
          </Link>
        </header>
        <div className="page-body">
          <div className="empty-state">
            <div>Zetel não encontrado.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <Link className="back-link" href="/zetel">
          ← Zetels
        </Link>
        <span className="page-title">{zetel.displayName}</span>
        {zetel.readingStale ? (
          <span className="badge warn">Leitura desatualizada</span>
        ) : zetel.lastBuiltAt ? (
          <span className="badge ok">Leitura atualizada</span>
        ) : null}
      </header>
      <div className="page-body page-body--zetel">
        <ZetelTabs
          zetelId={zetel.id}
          readingStale={zetel.readingStale}
          lastBuiltAt={zetel.lastBuiltAt}
        />
      </div>
    </>
  );
}
