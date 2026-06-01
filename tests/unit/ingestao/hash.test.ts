import { describe, expect, it } from 'vitest';
import { sha256, toPlainText } from '@/lib/ingestao-service';
import type { Node } from 'unist';

describe('sha256', () => {
  it('retorna string hexadecimal de 64 chars', () => {
    const hash = sha256('qualquer texto');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é estável para o mesmo input', () => {
    expect(sha256('texto A')).toBe(sha256('texto A'));
  });

  it('muda quando o texto muda', () => {
    expect(sha256('texto A')).not.toBe(sha256('texto B'));
  });

  it('aceita Buffer além de string', () => {
    const str = 'dados binários';
    const buf = Buffer.from(str, 'utf8');
    expect(sha256(buf)).toBe(sha256(str));
  });
});

describe('toPlainText', () => {
  it('extrai texto de nó com value', () => {
    const node: Node = { type: 'text', value: 'Texto simples.' } as Node & { value: string };
    expect(toPlainText(node)).toBe('Texto simples.');
  });

  it('concatena filhos recursivamente', () => {
    const node: Node = {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Olá ' },
        { type: 'strong', children: [{ type: 'text', value: 'mundo' }] },
        { type: 'text', value: '.' },
      ],
    } as unknown as Node;
    expect(toPlainText(node)).toBe('Olá mundo.');
  });

  it('retorna string vazia para nó sem value nem children', () => {
    const node: Node = { type: 'thematicBreak' };
    expect(toPlainText(node)).toBe('');
  });

  it('lida com nó de math inline', () => {
    const node: Node = { type: 'inlineMath', value: 'E = mc^2' } as Node & { value: string };
    expect(toPlainText(node)).toBe('E = mc^2');
  });
});
