import { describe, expect, it } from 'vitest';
import { extractJson } from '@/lib/study-guide-service';

describe('extractJson', () => {
  it('parseia JSON puro', () => {
    const result = extractJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('extrai JSON de bloco ```json ... ```', () => {
    const raw = '```json\n{"titulo": "Guia"}\n```';
    expect(extractJson(raw)).toEqual({ titulo: 'Guia' });
  });

  it('extrai JSON de bloco ``` sem rótulo', () => {
    const raw = '```\n{"a": 1}\n```';
    expect(extractJson(raw)).toEqual({ a: 1 });
  });

  it('ignora texto antes do bloco ```json', () => {
    const raw = 'Aqui vai o guia:\n```json\n{"x": 42}\n```';
    expect(extractJson(raw)).toEqual({ x: 42 });
  });

  it('ignora texto depois do bloco de código', () => {
    const raw = '```json\n{"y": true}\n```\nFim da resposta.';
    expect(extractJson(raw)).toEqual({ y: true });
  });

  it('lança SyntaxError para JSON inválido', () => {
    expect(() => extractJson('não é json')).toThrow();
  });

  it('lança para bloco cercado com JSON inválido', () => {
    expect(() => extractJson('```json\ninválido\n```')).toThrow();
  });

  it('parseia arrays JSON', () => {
    expect(extractJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });
});
