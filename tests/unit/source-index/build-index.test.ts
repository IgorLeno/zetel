import { describe, expect, it } from 'vitest';
import { buildSourceIndex } from '@/lib/source-index';
import type { IndexableFile } from '@/lib/source-index';
import type { RootContent } from 'mdast';

function headingNode(depth: 1 | 2 | 3, value: string): RootContent {
  return {
    type: 'heading',
    depth,
    children: [{ type: 'text', value }],
  } as RootContent;
}

function paragraphNode(value: string): RootContent {
  return {
    type: 'paragraph',
    children: [{ type: 'text', value }],
  } as RootContent;
}

function makeFile(sourceFile: string, nodes: RootContent[], pageIndex = 0): IndexableFile {
  return {
    sourceFile,
    pages: [{ pageIndex, nodes }],
  };
}

describe('buildSourceIndex', () => {
  it('block_id é estável e único para cada nó não-vazio', () => {
    const file = makeFile('a.md', [headingNode(1, 'Título'), paragraphNode('Parágrafo.')]);
    const { blocks } = buildSourceIndex([file]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].block_id).toBe('b0001');
    expect(blocks[1].block_id).toBe('b0002');
  });

  it('page_index é preservado por página', () => {
    const file: IndexableFile = {
      sourceFile: 'doc.md',
      pages: [
        { pageIndex: 3, nodes: [paragraphNode('Pág 3')] },
        { pageIndex: 7, nodes: [paragraphNode('Pág 7')] },
      ],
    };
    const { blocks } = buildSourceIndex([file]);
    expect(blocks[0].page_index).toBe(3);
    expect(blocks[1].page_index).toBe(7);
  });

  it('heading_path reflete hierarquia de headings', () => {
    const file = makeFile('b.md', [
      headingNode(1, 'Cap 1'),
      headingNode(2, 'Sec 1.1'),
      paragraphNode('Conteúdo.'),
    ]);
    const { blocks } = buildSourceIndex([file]);
    const para = blocks.find((b) => b.type === 'paragraph');
    expect(para?.heading_path).toEqual(['Cap 1', 'Sec 1.1']);
  });

  it('sha256 está preenchido e não vazio', () => {
    const file = makeFile('c.md', [paragraphNode('Texto qualquer.')]);
    const { blocks } = buildSourceIndex([file]);
    expect(blocks[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nós com texto vazio são ignorados', () => {
    // Forma inválida proposital: parágrafo sem filhos de texto (só para o teste).
    // @ts-expect-error — MDAST mínimo para exercitar toPlainText vazio
    const emptyPara: RootContent = { type: 'paragraph', children: [] };
    const file = makeFile('d.md', [emptyPara, paragraphNode('Visível.')]);
    const { blocks } = buildSourceIndex([file]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Visível.');
  });

  it('byHash indexa blocks pelo sha256', () => {
    const file = makeFile('e.md', [paragraphNode('Texto único.')]);
    const { blocks, byHash } = buildSourceIndex([file]);
    const hash = blocks[0].sha256;
    expect(byHash.get(hash)).toHaveLength(1);
  });

  it('block_id incrementa sequencialmente entre múltiplos arquivos', () => {
    const f1 = makeFile('f1.md', [paragraphNode('A')], 0);
    const f2 = makeFile('f2.md', [paragraphNode('B')], 1);
    const { blocks } = buildSourceIndex([f1, f2]);
    expect(blocks[0].block_id).toBe('b0001');
    expect(blocks[1].block_id).toBe('b0002');
  });

  it('heading_path não carrega headings de arquivo anterior', () => {
    const f1: IndexableFile = { sourceFile: 'f1.md', pages: [{ pageIndex: 0, nodes: [headingNode(1, 'F1-H1')] }] };
    const f2: IndexableFile = { sourceFile: 'f2.md', pages: [{ pageIndex: 1, nodes: [paragraphNode('Texto de f2.')] }] };
    const { blocks } = buildSourceIndex([f1, f2]);
    const paraF2 = blocks.find((b) => b.source_file === 'f2.md' && b.type === 'paragraph');
    // O heading de f1 não deve contaminar f2
    expect(paraF2?.heading_path).toEqual([]);
  });
});
