'use client';

import type { CitedSource } from '@/types/chat-message';
import { fonteCiteTarget, splitFonteMarkers } from '@/lib/fonte-markers';

/**
 * Renderiza a narrativa e transforma `[fonte:Sn]` conhecido em chip.
 * ID fora do mapa do turno permanece texto: sem destino inventado.
 */
export function FonteText({
  text,
  sources,
  onOpen,
}: {
  text: string;
  sources?: Record<string, CitedSource> | null;
  onOpen?: (target: { fileId: string; pageNumber: number }) => void;
}) {
  const parts = splitFonteMarkers(text);
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'text') return <span key={index}>{part.text}</span>;
        const target = onOpen ? fonteCiteTarget(part.id, sources) : null;
        if (!target?.fileId) return <span key={index}>{part.raw}</span>;
        return (
          <span key={index} className="fonte-chip">
            Documento · p. {target.pageNumber}
            <button
              type="button"
              className="fonte-chip-go"
              onClick={() => onOpen?.({ fileId: target.fileId as string, pageNumber: target.pageNumber })}
            >
              Ir até a página
            </button>
          </span>
        );
      })}
    </>
  );
}
