'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZetelFile } from '@/types/zetel-file';
import type { StudySession } from '@/types/study-session';
import { ChatPanel } from './ChatPanel';
import { StudyShell, type StudyMode } from './StudyShell';
import type { PdfSelection } from './PdfReader';

// Só no cliente: no SSR o servidor carregaria o build de navegador do pdf.js
// (`pdfjs-dist` é externo no servidor por causa da extração da tarefa 002).
const PdfReader = dynamic(() => import('./PdfReader').then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <div className="empty-state">Abrindo PDF…</div>,
});

/**
 * Visão de estudo de PDF (tarefa 003): leitor à esquerda, parceiro à direita.
 * O chat recebe só `fileId` + página; o servidor resolve o texto em `pdf_pages`.
 */
export function PdfStudyView({ zetelId, fileId }: { zetelId: string; fileId: string }) {
  const searchParams = useSearchParams();
  const requestedPage = Number(searchParams.get('page'));
  const initialPageNumber = Number.isInteger(requestedPage) && requestedPage >= 1
    ? requestedPage : 1;
  const [file, setFile] = useState<ZetelFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPageNumber);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  const focusWrite = useRef<Promise<void>>(Promise.resolve());
  // Seleção anexada ao próximo turno (tarefa 004). Vale só para a página dela.
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [goToRequest, setGoToRequest] = useState<{ page: number; token: number } | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>('reading');
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/zetels/${zetelId}/files`);
        const data = await res.json();
        if (cancelled) return;
        const found = res.ok
          ? (data.files as ZetelFile[]).find(
              (f) => f.id === fileId && f.filename.toLowerCase().endsWith('.pdf'),
            )
          : undefined;
        if (found) {
          setPageNumber(Math.min(found.pageCount ?? 1, initialPageNumber));
          setFile(found);
        }
        else setError('PDF não encontrado neste Zetel.');
      } catch {
        if (!cancelled) setError('Erro de rede ao carregar o PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // A página da URL é usada só ao abrir outro arquivo; a navegação subsequente é local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zetelId, fileId]);

  const onPageChange = useCallback((n: number) => {
    setPageNumber(n);
    setSelection((cur) => (cur && cur.pageNumber !== n ? null : cur));
  }, []);
  const onClearSelection = useCallback(() => setSelection(null), []);
  const onOpenSource = useCallback((target: { fileId: string; pageNumber: number }) => {
    if (target.fileId !== fileId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', 'pdf');
      params.set('file', target.fileId);
      params.set('page', String(target.pageNumber));
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    setGoToRequest({ page: target.pageNumber, token: Date.now() });
  }, [fileId, pathname, router, searchParams]);
  const onSessionChange = useCallback((session: StudySession | null) => {
    setActiveSessionId(session?.id ?? null);
  }, []);
  const onUserPageChange = useCallback((next: number) => {
    if (!activeSessionId) return;
    setFocusError(null);
    // Serializar evita que um PATCH antigo termine depois da página mais recente.
    focusWrite.current = focusWrite.current.then(async () => {
      const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId,
          focus: { scope: 'page', fileId, pageNumber: next } }),
      });
      if (!res.ok) throw new Error('focus');
      setFocusError(null);
    }).catch(() => setFocusError('Não foi possível guardar a página.'));
  }, [activeSessionId, fileId, zetelId]);

  if (error) return <p className="feedback err">{error}</p>;
  if (!file) return <div className="empty-state">Carregando…</div>;

  return (
    <div className="leitura-panel">
      {file.extractionStatus !== 'ok' && (
        <p className="feedback">
          {file.extractionStatus === 'no_text'
            ? 'Este PDF não tem texto extraível (OCR não suportado); o parceiro não verá o conteúdo das páginas.'
            : 'O texto deste PDF ainda não foi extraído. Processe os arquivos na aba Arquivos para conversar sobre ele.'}
        </p>
      )}
      {focusError && <p className="feedback err">{focusError}</p>}
      <StudyShell mode={studyMode} onModeChange={setStudyMode} readingLabel="PDF"
        reader={<PdfReader
          zetelId={zetelId}
          fileId={file.id}
          filename={file.filename}
          initialPageNumber={Math.min(file.pageCount ?? 1, initialPageNumber)}
          onPageChange={onPageChange}
          onUserPageChange={onUserPageChange}
          onAskAboutSelection={setSelection}
          goToRequest={goToRequest}
        />}
        chat={<ChatPanel
            zetelId={zetelId}
            currentReadingMode="tecnico"
            currentPageIndex={null}
            currentGuideBlockId={null}
            currentGuideSectionId={null}
            currentGuideBlockTitle={null}
            currentGuideBlockIndex={null}
            currentGuideBlockTotal={null}
            pdfFocus={{
              fileId: file.id,
              pageNumber,
              selectionText: selection?.pageNumber === pageNumber ? selection.text : undefined,
            }}
            onClearPdfSelection={onClearSelection}
            onOpenSource={onOpenSource}
            onSessionChange={onSessionChange}
            createSessionIfEmpty={file.extractionStatus === 'ok' || file.extractionStatus === 'no_text'}
          />}
      />
    </div>
  );
}
