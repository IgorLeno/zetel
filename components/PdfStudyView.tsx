'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type { ZetelFile } from '@/types/zetel-file';
import { ChatPanel } from './ChatPanel';

// Só no cliente: no SSR o servidor carregaria o build de navegador do pdf.js
// (`pdfjs-dist` é externo no servidor por causa da extração da tarefa 002).
const PdfReader = dynamic(() => import('./PdfReader').then((m) => m.PdfReader), {
  ssr: false,
  loading: () => <div className="empty-state">Abrindo PDF…</div>,
});

const CHAT_WIDTH = 360;

/**
 * Visão de estudo de PDF (tarefa 003): leitor à esquerda, parceiro à direita.
 * O chat recebe só `fileId` + página; o servidor resolve o texto em `pdf_pages`.
 */
export function PdfStudyView({ zetelId, fileId }: { zetelId: string; fileId: string }) {
  const [file, setFile] = useState<ZetelFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

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
        if (found) setFile(found);
        else setError('PDF não encontrado neste Zetel.');
      } catch {
        if (!cancelled) setError('Erro de rede ao carregar o PDF.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zetelId, fileId]);

  const onPageChange = useCallback((n: number) => setPageNumber(n), []);

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
      <div className="leitura-body leitura-with-chat">
        <PdfReader
          zetelId={zetelId}
          fileId={file.id}
          filename={file.filename}
          onPageChange={onPageChange}
        />
        <div style={{ width: CHAT_WIDTH, minWidth: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <ChatPanel
            zetelId={zetelId}
            currentReadingMode="tecnico"
            currentPageIndex={null}
            currentGuideBlockId={null}
            currentGuideSectionId={null}
            currentGuideBlockTitle={null}
            currentGuideBlockIndex={null}
            currentGuideBlockTotal={null}
            pdfFocus={{ fileId: file.id, pageNumber }}
          />
        </div>
      </div>
    </div>
  );
}
