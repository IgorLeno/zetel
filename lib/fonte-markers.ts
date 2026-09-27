import type { CitedSource } from '@/types/chat-message';

export type FontePart =
  | { kind: 'text'; text: string }
  | { kind: 'cite'; id: string; raw: string };

const FONTE_MARK = /\[fonte:(S\d+)\]/g;

/** Parte o texto visível em trechos e citações `[fonte:Sn]`. */
export function splitFonteMarkers(text: string): FontePart[] {
  const parts: FontePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(FONTE_MARK)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, index) });
    parts.push({ kind: 'cite', id: match[1], raw: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts;
}

/**
 * Destino de uma citação. ID ausente do mapa do turno não vira link:
 * o cliente não inventa arquivo nem página.
 */
export function fonteCiteTarget(
  id: string,
  sources: Record<string, CitedSource> | null | undefined,
): CitedSource | null {
  const source = sources?.[id];
  if (!source || !source.fileId || !Number.isInteger(source.pageNumber) || source.pageNumber < 1) {
    return null;
  }
  return source;
}

/** TTS não lê o marcador (D10). */
export function stripFonteMarkers(text: string): string {
  return text.replace(FONTE_MARK, '');
}
