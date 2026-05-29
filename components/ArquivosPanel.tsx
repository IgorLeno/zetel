'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ZetelFile } from '@/types/zetel-file';
import { formatRelative } from '@/lib/relative-time';

/** "12 KB", "1,2 MB" — PT-BR, sem dependências de Node (client). */
function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function ArquivosPanel({ zetelId }: { zetelId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<ZetelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/files`);
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
      } else {
        setError(data.error ?? 'Falha ao carregar os arquivos.');
      }
    } catch {
      setError('Erro de rede ao carregar os arquivos.');
    } finally {
      setLoading(false);
    }
  }, [zetelId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (picked.length === 0) return;

    setUploading(true);
    setError(null);
    setProcessMsg(null);
    try {
      for (const file of picked) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/zetels/${zetelId}/files`, { method: 'POST', body: form });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? `Falha ao adicionar "${file.name}".`);
          break;
        }
      }
    } catch {
      setError('Erro de rede ao adicionar arquivos.');
    } finally {
      setUploading(false);
      await load();
      router.refresh(); // badge de status do header (reading_stale)
    }
  }

  async function remove(fileId: string) {
    setError(null);
    setConfirmingRemove(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Falha ao remover o arquivo.');
      }
    } catch {
      setError('Erro de rede ao remover o arquivo.');
    } finally {
      await load();
      router.refresh();
    }
  }

  async function persistOrder(next: ZetelFile[]) {
    try {
      const res = await fetch(`/api/zetels/${zetelId}/files/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: next.map((f) => f.id) }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Falha ao reordenar.');
        await load();
      } else {
        router.refresh();
      }
    } catch {
      setError('Erro de rede ao reordenar.');
      await load();
    }
  }

  function onDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...files];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    setFiles(next); // otimista
    persistOrder(next);
  }

  async function processar() {
    setProcessing(true);
    setError(null);
    setProcessMsg(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/process`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const r = data.result;
        const parts = [`${r.pagesCount} página${r.pagesCount === 1 ? '' : 's'} gerada${r.pagesCount === 1 ? '' : 's'}`];
        if (r.imagesCopied) parts.push(`${r.imagesCopied} imagem(ns) copiada(s)`);
        if (r.imagesBlocked) parts.push(`${r.imagesBlocked} externa(s) bloqueada(s)`);
        setProcessMsg(parts.join(' · '));
      } else {
        setError(data.error ?? 'Falha ao processar.');
      }
    } catch {
      setError('Erro de rede ao processar.');
    } finally {
      setProcessing(false);
      await load();
      router.refresh(); // atualiza o badge de leitura no header
    }
  }

  if (loading) return <p className="field-hint">Carregando…</p>;

  return (
    <div className="arquivos-panel">
      <div className="list-toolbar">
        <button
          className="btn primary"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || processing}
        >
          {uploading ? 'Adicionando…' : 'Adicionar arquivos'}
        </button>
        <button
          className="btn"
          type="button"
          onClick={processar}
          disabled={processing || uploading || files.length === 0}
        >
          {processing ? 'Processando…' : 'Processar'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".md"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </div>

      {error && <p className="feedback err">{error}</p>}
      {processMsg && <p className="feedback ok">{processMsg}</p>}

      {files.length === 0 ? (
        <p className="field-hint">Nenhum arquivo ainda. Adicione um arquivo .md para começar.</p>
      ) : (
        <ul className="file-list">
          {files.map((f, index) => (
            <li
              key={f.id}
              className={`file-row${draggingIndex === index ? ' dragging' : ''}`}
              draggable
              onDragStart={() => {
                dragIndex.current = index;
                setDraggingIndex(index);
              }}
              onDragEnd={() => setDraggingIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              <span className="drag-handle" aria-hidden="true" title="Arrastar para reordenar">
                ⠿
              </span>
              <div className="file-main">
                <span className="file-name">
                  {f.filename}
                  {f.driftDetected && (
                    <span
                      className="badge warn"
                      title="Este arquivo foi modificado fora do Zetel. Reprocesse para atualizar."
                    >
                      modificado externamente
                    </span>
                  )}
                </span>
                <span className="file-meta">
                  {formatBytes(f.sizeBytes)} · {formatRelative(f.updatedAt)}
                </span>
              </div>
              {confirmingRemove === f.id ? (
                <span className="file-confirm">
                  <button className="btn danger" type="button" onClick={() => remove(f.id)}>
                    Remover
                  </button>
                  <button className="btn" type="button" onClick={() => setConfirmingRemove(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={`Remover ${f.filename}`}
                  onClick={() => setConfirmingRemove(f.id)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
