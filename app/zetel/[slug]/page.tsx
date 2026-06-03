import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { getZetelBySlug } from '@/lib/zetel-service';
import { ChevronLeftIcon } from '@/components/icons/ChevronLeftIcon';
import { ZetelWorkspace } from '@/components/ZetelWorkspace';
import { ReadingProgress } from '@/components/ReadingProgress';

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
  const store = await cookies();
  const theme = store.get('zetel-theme')?.value === 'dark' ? 'dark' : 'light';

  if (!zetel || zetel.trashedAt) {
    return (
      <>
        <header className="topbar">
          <Link className="crumb" href="/zetel">
            <ChevronLeftIcon />
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
          <ChevronLeftIcon />
          Zetels
        </Link>
        <span className="crumb-sep">/</span>
        <span className="doc-title">{zetel.displayName}</span>
        <div className="topbar-spacer" />
        <ReadingProgress theme={theme} />
      </header>
      <div className="page-body page-body--zetel">
        <ZetelWorkspace
          zetelId={zetel.id}
          readingStale={zetel.readingStale}
          lastBuiltAt={zetel.lastBuiltAt}
        />
      </div>
    </>
  );
}
