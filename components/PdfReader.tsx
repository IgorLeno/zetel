'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Carrega o pdf.js só no cliente (D1). O worker roda num Web Worker empacotado
 * pelo Next a partir do próprio pacote — nenhum script externo.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL('./pdf-worker.ts', import.meta.url),
          { type: 'module' },
        );
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const RENDER_SCALE = 1.4;

/** Mesmo teto do servidor (`SELECTION_MAX_CHARS`); o servidor revalida. */
const SELECTION_MAX_CHARS = 2000;

export interface PdfSelection {
  pageNumber: number;
  text: string;
}

/**
 * Leitor PDF da visão de estudo (tarefa 003): canvas + camada de texto, uma
 * página por vez. Informa a página atual ao pai; mudar de página não dispara
 * turno nem fala. Documento só de exibição: sem scripting, XFA ou formulários.
 */
export function PdfReader({
  zetelId,
  fileId,
  filename,
  initialPageNumber = 1,
  onPageChange,
  onUserPageChange,
  onAskAboutSelection,
  goToRequest = null,
}: {
  zetelId: string;
  fileId: string;
  filename: string;
  initialPageNumber?: number;
  onPageChange: (pageNumber: number) => void;
  onUserPageChange?: (pageNumber: number) => void;
  /** "Conversar sobre isto" (tarefa 004): texto candidato; o servidor verifica. */
  onAskAboutSelection?: (selection: PdfSelection) => void;
  /** Pedido externo (citação). `token` muda a cada clique, mesmo na mesma página. */
  goToRequest?: { page: number; token: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageBoxRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPageNumber);
  const [pageInput, setPageInput] = useState(String(initialPageNumber));
  const appliedGoTo = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPageNumber(initialPageNumber);
    setPageInput(String(initialPageNumber));
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        task = pdfjs.getDocument({
          url: `/api/zetels/${zetelId}/files/${fileId}/pdf`,
          enableXfa: false,
          isOffscreenCanvasSupported: false,
          verbosity: pdfjs.VerbosityLevel.ERRORS,
        });
        const loaded = await task.promise;
        if (!cancelled) {
          const initial = Math.min(loaded.numPages, Math.max(1, initialPageNumber));
          setPageNumber(initial);
          setPageInput(String(initial));
          setDoc(loaded);
        }
      } catch {
        if (!cancelled) setError('Não foi possível abrir o PDF. Verifique o arquivo na aba Arquivos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Libera documento e requisições; o worker compartilhado continua vivo.
      if (task) void task.destroy();
    };
    // A página inicial é aplicada novamente abaixo sem reabrir o documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zetelId, fileId]);

  useEffect(() => {
    if (!doc) return;
    const next = Math.min(doc.numPages, Math.max(1, initialPageNumber));
    setPageNumber(next);
    setPageInput(String(next));
  }, [doc, initialPageNumber]);

  useEffect(() => {
    onPageChange(pageNumber);
  }, [pageNumber, onPageChange]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = canvasRef.current;
        const textDiv = textLayerRef.current;
        const box = pageBoxRef.current;
        if (!canvas || !textDiv || !box) return;

        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        box.style.width = `${Math.floor(viewport.width)}px`;
        box.style.height = `${Math.floor(viewport.height)}px`;
        box.style.setProperty('--total-scale-factor', String(RENDER_SCALE));

        renderTask = page.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        textDiv.replaceChildren();
        textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        });
        await Promise.all([renderTask.promise, textLayer.render()]);
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== 'RenderingCancelledException') {
          setError('Falha ao desenhar a página do PDF.');
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, pageNumber]);

  // Só conta seleção inteiramente dentro da camada de texto da página.
  useEffect(() => {
    function onSelectionChange() {
      const sel = document.getSelection();
      const layer = textLayerRef.current;
      if (!sel || sel.isCollapsed || !layer || sel.rangeCount === 0) {
        setSelectedText('');
        return;
      }
      const range = sel.getRangeAt(0);
      const inside =
        layer.contains(range.startContainer) && layer.contains(range.endContainer);
      setSelectedText(inside ? sel.toString().trim() : '');
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  useEffect(() => {
    setSelectedText('');
  }, [pageNumber, fileId]);

  useEffect(() => {
    if (!goToRequest || goToRequest.token === appliedGoTo.current) return;
    appliedGoTo.current = goToRequest.token;
    const totalPages = doc?.numPages ?? null;
    const next = totalPages
      ? Math.min(totalPages, Math.max(1, goToRequest.page))
      : Math.max(1, goToRequest.page);
    setPageNumber(next);
    setPageInput(String(next));
    onUserPageChange?.(next);
  }, [goToRequest, doc, onUserPageChange]);

  const selectionTooLong = selectedText.length > SELECTION_MAX_CHARS;

  const total = doc?.numPages ?? null;

  const goTo = useCallback(
    (n: number) => {
      if (!total) return;
      const next = Math.min(total, Math.max(1, n));
      if (next === pageNumber) return;
      setPageNumber(next);
      setPageInput(String(next));
      onUserPageChange?.(next);
    },
    [total, pageNumber, onUserPageChange],
  );

  function onPageInputCommit() {
    const n = Number.parseInt(pageInput, 10);
    if (Number.isFinite(n)) goTo(n);
    else setPageInput(String(pageNumber));
  }

  return (
    <section className="pdf-reader" aria-label={`Leitor PDF: ${filename}`}>
      <div className="pdf-reader-toolbar" role="toolbar" aria-label="Navegação de páginas">
        <span className="pdf-reader-title" title={filename}>{filename}</span>
        <button
          type="button"
          className="btn"
          onClick={() => goTo(pageNumber - 1)}
          disabled={!total || pageNumber <= 1}
          aria-label="Página anterior"
        >
          ‹
        </button>
        <label className="pdf-reader-page">
          <input
            type="number"
            min={1}
            max={total ?? undefined}
            value={pageInput}
            disabled={!total}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={onPageInputCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPageInputCommit();
            }}
            aria-label="Número da página"
          />
          <span aria-live="polite">de {total ?? '…'}</span>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => goTo(pageNumber + 1)}
          disabled={!total || pageNumber >= total}
          aria-label="Próxima página"
        >
          ›
        </button>
        {onAskAboutSelection && selectedText && (
          <button
            type="button"
            className="btn primary"
            // preventDefault: o clique não pode desfazer a seleção antes de lê-la.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAskAboutSelection({ pageNumber, text: selectedText })}
            disabled={selectionTooLong}
            title={
              selectionTooLong
                ? `Seleção longa demais (máx. ${SELECTION_MAX_CHARS} caracteres)`
                : 'Conversar com o parceiro sobre o trecho selecionado'
            }
          >
            Conversar sobre isto
          </button>
        )}
      </div>
      {selectionTooLong && (
        <p className="feedback" role="status">
          Seleção longa demais para conversar (máx. {SELECTION_MAX_CHARS} caracteres).
        </p>
      )}
      {error && <p className="feedback err">{error}</p>}
      {loading && !error && <div className="empty-state">Abrindo PDF…</div>}
      <div className="pdf-reader-scroll">
        <div className="pdf-reader-page-box" ref={pageBoxRef} hidden={!doc}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="textLayer" ref={textLayerRef} />
        </div>
      </div>
    </section>
  );
}
