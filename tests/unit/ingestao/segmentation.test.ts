import { describe, expect, it } from 'vitest';
import type { Root } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import {
  makeAnchorFactory,
  parseMarkdownForSegmentation,
  segmentFile,
  stripInitialYamlFrontmatter,
} from '@/lib/ingestao-service';

describe('parseMarkdownForSegmentation', () => {
  it('retorna Root com children para markdown simples', () => {
    const tree = parseMarkdownForSegmentation('# Título\n\nTexto.');
    expect(tree.type).toBe('root');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('remove frontmatter YAML inicial', () => {
    const md = '---\ntitulo: Doc\n---\n\n# Seção\n\nConteúdo.';
    const tree = parseMarkdownForSegmentation(md);
    const types = tree.children.map((n) => n.type);
    expect(types).not.toContain('yaml');
    expect(types).toContain('heading');
  });

  it('preserva tabelas GFM', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const tree = parseMarkdownForSegmentation(md);
    expect(tree.children.some((n) => n.type === 'table')).toBe(true);
  });
});

describe('stripInitialYamlFrontmatter', () => {
  it('remove nó yaml no início', () => {
    const tree = remark()
      .use(remarkFrontmatter, ['yaml'])
      .parse('---\nkey: val\n---\n\n# H\n') as Root;
    expect(tree.children[0]?.type).toBe('yaml');
    stripInitialYamlFrontmatter(tree);
    expect(tree.children.some((n) => n.type === 'yaml')).toBe(false);
    expect(tree.children[0]?.type).toBe('heading');
  });

  it('não remove yaml que não está no início', () => {
    // Quando há texto antes do frontmatter, ele não é tratado como yaml pelo remark-frontmatter
    const tree = parseMarkdownForSegmentation('Texto.\n\n---\nkey: val\n---');
    // Neste caso o --- é thematicBreak, não yaml
    expect(tree.children[0].type).toBe('paragraph');
  });
});

describe('segmentFile', () => {
  it('segmenta texto em página única para conteúdo curto', () => {
    const tree = parseMarkdownForSegmentation('# Título\n\nTexto curto.');
    const anchorOf = makeAnchorFactory(new Set());
    const pages = segmentFile(tree, 'doc', 1000, 0, anchorOf);
    expect(pages).toHaveLength(1);
    expect(pages[0].heading).toBe('Título');
  });

  it('captura heading em página única para conteúdo curto', () => {
    const tree = parseMarkdownForSegmentation('# Seção A\n\nConteúdo A.');
    const anchorOf = makeAnchorFactory(new Set());
    const pages = segmentFile(tree, 'doc', 1000, 5, anchorOf);
    expect(pages).toHaveLength(1);
    expect(pages[0].heading).toBe('Seção A');
  });

  it('segmentação é determinística para o mesmo input', () => {
    const md = '# H1\n\nTexto.\n\n## H2\n\nMais texto.';
    const make = () => {
      const tree = parseMarkdownForSegmentation(md);
      return segmentFile(tree, 'doc', 1000, 0, makeAnchorFactory(new Set()));
    };
    const r1 = make();
    const r2 = make();
    expect(r1.map((p) => p.heading)).toEqual(r2.map((p) => p.heading));
    expect(r1.map((p) => p.anchor)).toEqual(r2.map((p) => p.anchor));
  });

  it('anchors são únicos mesmo com headings duplicados', () => {
    const md = '# Seção\n\nA.\n\n# Seção\n\nB.';
    const tree = parseMarkdownForSegmentation(md);
    const anchorOf = makeAnchorFactory(new Set());
    const pages = segmentFile(tree, 'doc', 1000, 0, anchorOf);
    const anchors = pages.map((p) => p.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('contentText contém o texto plano dos nós', () => {
    const md = '# Título\n\nPrimeiro parágrafo.\n\nSegundo parágrafo.';
    const tree = parseMarkdownForSegmentation(md);
    const anchorOf = makeAnchorFactory(new Set());
    const pages = segmentFile(tree, 'doc', 1000, 0, anchorOf);
    expect(pages[0].contentText).toContain('Título');
    expect(pages[0].contentText).toContain('Primeiro parágrafo.');
  });

  it('quebra em nova página ao atingir maxWords', () => {
    // 5 palavras por parágrafo, limit de 8 → deve quebrar
    const md = '# P1\n\nUm dois três quatro cinco.\n\n# P2\n\nSeis sete oito nove dez.';
    const tree = parseMarkdownForSegmentation(md);
    const anchorOf = makeAnchorFactory(new Set());
    const pages = segmentFile(tree, 'doc', 6, 0, anchorOf);
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });
});

describe('makeAnchorFactory', () => {
  it('gera o anchor base na primeira chamada', () => {
    const anchorOf = makeAnchorFactory(new Set());
    expect(anchorOf('intro')).toBe('intro');
  });

  it('adiciona sufixo numérico na colisão', () => {
    const anchorOf = makeAnchorFactory(new Set());
    anchorOf('sec');
    const second = anchorOf('sec');
    expect(second).toBe('sec-2');
    const third = anchorOf('sec');
    expect(third).toBe('sec-3');
  });

  it('usa "secao" como fallback para base vazia', () => {
    const anchorOf = makeAnchorFactory(new Set());
    expect(anchorOf('')).toBe('secao');
  });
});
