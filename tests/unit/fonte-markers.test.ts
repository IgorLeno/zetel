import { describe, expect, it } from 'vitest';
import { fonteCiteTarget, splitFonteMarkers, stripFonteMarkers } from '@/lib/fonte-markers';
import type { CitedSource } from '@/types/chat-message';

const known: Record<string, CitedSource> = {
  S2: { fileId: 'file-2', filename: 'Livro.pdf', pageNumber: 7, type: 'recuperado' },
};

describe('citações [fonte:Sn]', () => {
  it('ID desconhecido não vira destino', () => {
    expect(fonteCiteTarget('S99', known)).toBeNull();
    expect(fonteCiteTarget('S2', known)?.pageNumber).toBe(7);
    const parts = splitFonteMarkers('veja [fonte:S99] e [fonte:S2].');
    expect(parts.filter((part) => part.kind === 'cite').map((part) => part.kind === 'cite' ? part.id : '')).toEqual(['S99', 'S2']);
  });

  it('remove o marcador da fala', () => {
    expect(stripFonteMarkers('Entalpia [fonte:S2] é H.')).toBe('Entalpia  é H.');
  });
});
