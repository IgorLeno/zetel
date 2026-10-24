import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getZetelBySlug } from '@/lib/zetel-service';
import { ChevronLeftIcon } from '@/components/icons/ChevronLeftIcon';
import { ZetelWorkspace } from '@/components/ZetelWorkspace';
import { ReadingProgress } from '@/components/ReadingProgress';
import { StudyDrawerButton } from '@/components/ZetelWorkspace';

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
  const db = getDb();
  const zetel = getZetelBySlug(db, slug);
  if (!zetel || zetel.trashedAt) {
    return (
      <>
        <header className="topbar">
          <Link className="crumb" href="/zetel">
            <ChevronLeftIcon />
            Voltar
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

  const hasSources = Boolean(db.prepare('SELECT 1 FROM zetel_files WHERE zetel_id = ? LIMIT 1').get(zetel.id));
  // "Original" abre o primeiro PDF (ordem das fontes); sem PDF, o Documento Técnico do Markdown.
  const firstPdf = db.prepare(
    "SELECT id FROM zetel_files WHERE zetel_id = ? AND lower(filename) LIKE '%.pdf' ORDER BY order_index LIMIT 1",
  ).get(zetel.id) as { id: string } | undefined;

  return (
    <>
      <header className="topbar">
        <Link className="crumb" href="/zetel" aria-label="Voltar aos estudos">
          <ChevronLeftIcon />
        </Link>
        <span className="doc-title">{zetel.displayName}</span>
        <ReadingProgress />
        <div className="topbar-spacer" />
        {/* Sempre visível: a Curadoria dos relatórios do ChatGPT vive na gaveta, com ou sem fontes. */}
        <StudyDrawerButton />
      </header>
      <div className="page-body page-body--zetel">
        <ZetelWorkspace
          zetelId={zetel.id}
          slug={zetel.slug}
          hasSources={hasSources}
          originalPdfId={firstPdf?.id ?? null}
          readingStale={zetel.readingStale}
          lastBuiltAt={zetel.lastBuiltAt}
        />
      </div>
    </>
  );
}
