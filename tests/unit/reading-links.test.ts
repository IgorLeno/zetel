import { describe, expect, it } from 'vitest';
import { guideReadingQuery, originalReadingQuery } from '@/lib/reading-links';

describe('originalReadingQuery', () => {
  it('com PDF, "Original" abre o primeiro PDF e descarta a página anterior', () => {
    const q = new URLSearchParams(originalReadingQuery('view=guia-estudo&page=4&painel=notas', 'f1'));
    expect(q.get('view')).toBe('pdf');
    expect(q.get('file')).toBe('f1');
    expect(q.get('page')).toBeNull();
    expect(q.get('painel')).toBe('notas');
  });

  it('sem PDF, "Original" é o Documento Técnico', () => {
    const q = new URLSearchParams(originalReadingQuery('view=guia-estudo&file=velho', null));
    expect(q.get('view')).toBe('tecnico');
    expect(q.get('file')).toBeNull();
  });
});

describe('guideReadingQuery', () => {
  it('sai do PDF para o Guia sem arrastar arquivo nem página', () => {
    const q = new URLSearchParams(guideReadingQuery('view=pdf&file=f1&page=7'));
    expect(q.get('view')).toBe('guia-estudo');
    expect(q.get('file')).toBeNull();
    expect(q.get('page')).toBeNull();
  });
});
