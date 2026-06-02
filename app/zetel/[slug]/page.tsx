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
  if (!zetel || zetel.trashedAt) {
    return { title: 'Zetel não encontrado' };
  }
  return { title: zetel.displayName };
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
        <header className="topbar">
          <Link className="crumb" href="/zetel">
            <svg viewBox="0 0 16 16"><path d="M10 12L6 8l4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Zetels
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
      <header className="topbar">
        <Link className="crumb" href="/zetel">
          <svg viewBox="0 0 16 16"><path d="M10 12L6 8l4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Zetels
        </Link>
        <span className="crumb-sep">/</span>
        <span className="doc-title">{zetel.displayName}</span>
        {zetel.readingStale ? (
          <span className="pill warn"><span className="dot" />Desatualizado</span>
        ) : zetel.lastBuiltAt ? (
          <span className="pill ok"><span className="dot" />Atualizado</span>
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
