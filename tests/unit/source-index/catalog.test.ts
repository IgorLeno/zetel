import { describe, expect, it } from 'vitest';
import { buildSourceIndex, catalogForPrompt } from '@/lib/source-index';
import type { IndexableFile } from '@/lib/source-index';
import type { RootContent } from 'mdast';

function paragraphNode(value: string): RootContent {
  return { type: 'paragraph', children: [{ type: 'text', value }] } as RootContent;
}

describe('catalogForPrompt', () => {
  it('trunca texto maior que maxChars e adiciona ellipsis', () => {
    const longText = 'x'.repeat(300);
    const file: IndexableFile = {
      sourceFile: 'a.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode(longText)] }],
    };
    const idx = buildSourceIndex([file]);
    const entries = catalogForPrompt(idx, 50);
    expect(entries[0].text.endsWith('…')).toBe(true);
    expect(entries[0].text.length).toBeLessThanOrEqual(51);
  });

  it('não trunca texto menor que maxChars', () => {
    const shortText = 'Texto curto.';
    const file: IndexableFile = {
      sourceFile: 'b.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode(shortText)] }],
    };
    const idx = buildSourceIndex([file]);
    const entries = catalogForPrompt(idx);
    expect(entries[0].text).toBe(shortText);
  });

  it('colapsa whitespace em excesso no texto', () => {
    const spaced = 'Texto   com   múltiplos   espaços.';
    const file: IndexableFile = {
      sourceFile: 'c.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode(spaced)] }],
    };
    const idx = buildSourceIndex([file]);
    const entries = catalogForPrompt(idx);
    expect(entries[0].text).toBe('Texto com múltiplos espaços.');
  });

  it('inclui sha256, block_id, source_file e heading_path em cada entrada', () => {
    const file: IndexableFile = {
      sourceFile: 'doc.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode('Parágrafo teste.')] }],
    };
    const idx = buildSourceIndex([file]);
    const entries = catalogForPrompt(idx);
    expect(entries[0]).toHaveProperty('sha256');
    expect(entries[0]).toHaveProperty('block_id');
    expect(entries[0]).toHaveProperty('source_file', 'doc.md');
    expect(entries[0]).toHaveProperty('heading_path');
  });
});
