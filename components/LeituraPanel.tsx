'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function LeituraPanel({
  zetelId,
  readingStale,
  lastBuiltAt,
}: {
  zetelId: string;
  readingStale: boolean;
  lastBuiltAt: string | null;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBuilt = lastBuiltAt !== null;
  const showIframe = hasBuilt && !building;

  const buttonLabel = hasBuilt ? 'Atualizar leitura' : 'Preparar leitura';
  const buttonPrimary = !hasBuilt || readingStale;

  async function onBuild() {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/build`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao construir a leitura.');
        return;
      }
      router.refresh();
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    } catch {
      setError('Erro de rede ao construir a leitura.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="leitura-panel">
      <div className="leitura-toolbar">
        <button
          type="button"
          className={buttonPrimary ? 'btn primary' : 'btn'}
          disabled={building}
          onClick={onBuild}
        >
          {building ? 'Construindo…' : buttonLabel}
        </button>
        {hasBuilt && !readingStale && !building && (
          <span className="feedback ok">Leitura pronta para uso.</span>
        )}
      </div>
      {error && <p className="feedback err">{error}</p>}

      {!hasBuilt && !building ? (
        <div className="empty-state leitura-empty">
          <div>Nenhuma leitura construída ainda.</div>
        </div>
      ) : showIframe ? (
        <iframe
          ref={iframeRef}
          className="leitura-iframe"
          title="Leitura do Zetel"
          sandbox="allow-scripts"
          src={`/api/zetels/${zetelId}/leitura`}
        />
      ) : building ? (
        <div className="empty-state leitura-empty">
          <div>Gerando HTML de leitura…</div>
        </div>
      ) : null}
    </div>
  );
}
