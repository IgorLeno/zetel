import { describe, it, expect } from 'vitest';
import { extractSentences } from '@/hooks/useTtsQueue';

describe('extractSentences', () => {
  it('returns incomplete sentence in rest when no trailing whitespace', () => {
    const { sentences, rest } = extractSentences('Hello world.');
    expect(sentences).toEqual([]);
    expect(rest).toBe('Hello world.');
  });

  it('emits sentence when followed by space', () => {
    const { sentences, rest } = extractSentences('Hello world. ');
    expect(sentences).toEqual(['Hello world.']);
    expect(rest).toBe('');
  });

  it('handles multiple complete sentences', () => {
    const { sentences, rest } = extractSentences('First sentence. Second sentence. ');
    expect(sentences).toEqual(['First sentence.', 'Second sentence.']);
    expect(rest).toBe('');
  });

  it('leaves last incomplete sentence in rest', () => {
    const { sentences, rest } = extractSentences('First. Second');
    expect(sentences).toEqual(['First.']);
    expect(rest).toBe('Second');
  });

  it('handles ! and ? punctuation', () => {
    const { sentences, rest } = extractSentences('Really? Yes! And more');
    expect(sentences).toEqual(['Really?', 'Yes!']);
    expect(rest).toBe('And more');
  });

  it('does not break at known PT-BR abbreviation Prof.', () => {
    const { sentences, rest } = extractSentences('Prof. Smith chegou. ');
    expect(sentences).toEqual(['Prof. Smith chegou.']);
    expect(rest).toBe('');
  });

  it('does not break at abbreviation Fig.', () => {
    const { sentences, rest } = extractSentences('Veja Fig. 3 para detalhes. ');
    expect(sentences).toEqual(['Veja Fig. 3 para detalhes.']);
    expect(rest).toBe('');
  });

  it('does not break at abbreviation etc.', () => {
    const { sentences, rest } = extractSentences('Usamos Python, Java, etc. no projeto. ');
    expect(sentences).toEqual(['Usamos Python, Java, etc. no projeto.']);
    expect(rest).toBe('');
  });

  it('does not break at abbreviation Dr.', () => {
    const { sentences, rest } = extractSentences('O Dr. Silva atendeu. ');
    expect(sentences).toEqual(['O Dr. Silva atendeu.']);
    expect(rest).toBe('');
  });

  it('does not break mid-decimal (3.14 — no whitespace after dot)', () => {
    const { sentences, rest } = extractSentences('Pi é aproximadamente 3.14 em cálculos. ');
    expect(sentences).toEqual(['Pi é aproximadamente 3.14 em cálculos.']);
    expect(rest).toBe('');
  });

  it('breaks on paragraph separator \\n\\n', () => {
    const { sentences, rest } = extractSentences('Primeiro parágrafo\n\nSegundo parágrafo');
    expect(sentences).toEqual(['Primeiro parágrafo']);
    expect(rest).toBe('Segundo parágrafo');
  });

  it('combines paragraph break and sentence punctuation', () => {
    const { sentences, rest } = extractSentences('Frase um. Frase dois.\n\nNovo parágrafo');
    expect(sentences).toEqual(['Frase um.', 'Frase dois.']);
    expect(rest).toBe('Novo parágrafo');
  });

  it('returns empty sentences and full buffer for short text without punctuation', () => {
    const { sentences, rest } = extractSentences('Texto curto sem pontuação');
    expect(sentences).toEqual([]);
    expect(rest).toBe('Texto curto sem pontuação');
  });

  it('fallback: cuts at last space ≤ 140 chars when buffer exceeds limit without punctuation', () => {
    // 'ab ' repeated 47 times + 'ab' = 47*3 + 2 = 143 chars; space at index 140
    const buffer = 'ab '.repeat(47) + 'ab';
    expect(buffer.length).toBe(143);
    const { sentences, rest } = extractSentences(buffer);
    expect(sentences).toHaveLength(1);
    // The cut is at index 140 (the space), so the sentence is buffer.slice(0,140).trim()
    expect(sentences[0]).toBe(buffer.slice(0, 140).trim());
    expect(rest).toBe('ab');
  });

  it('fallback: does not cut if no space found within FIRST_CHUNK_MAX', () => {
    // A single 200-char word with no spaces
    const buffer = 'a'.repeat(200);
    const { sentences, rest } = extractSentences(buffer);
    expect(sentences).toEqual([]);
    expect(rest).toBe(buffer);
  });

  it('handles empty buffer', () => {
    const { sentences, rest } = extractSentences('');
    expect(sentences).toEqual([]);
    expect(rest).toBe('');
  });

  it('handles buffer with only whitespace', () => {
    const { sentences, rest } = extractSentences('   ');
    expect(sentences).toEqual([]);
    expect(rest).toBe('   ');
  });
});
