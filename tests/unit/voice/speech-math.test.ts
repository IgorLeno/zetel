import { describe, expect, it } from 'vitest';
import { speakMath, verbalizeLatex } from '@/lib/speech-math';
import { toSpeakable } from '@/lib/speech-text';

describe('verbalizeLatex', () => {
  it('integral definida com fração', () => {
    expect(verbalizeLatex(String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`))
      .toBe('integral de 0 até 1 de x ao quadrado dx igual a 1 sobre 3');
  });

  it('somatório, aproximação e nabla', () => {
    expect(verbalizeLatex(String.raw`\sum_{i=1}^{n} a_i \approx \nabla f`))
      .toBe('somatório de i igual a 1 até n de a i aproximadamente nabla f');
  });

  it('limite, raiz, potência negativa e letras gregas', () => {
    expect(verbalizeLatex(String.raw`\lim_{x\to 0} \sqrt{x} + \psi_n^{-1}`))
      .toBe('limite quando x tende a 0 de raiz de x mais psi n elevado a menos 1');
  });

  it('fração aninhada resolve de dentro para fora', () => {
    expect(verbalizeLatex(String.raw`\frac{\frac{a}{b}}{c}`)).toBe('a sobre b sobre c');
  });

  it('nunca deixa barra, chave ou circunflexo', () => {
    const spoken = verbalizeLatex(String.raw`\left( \hat{H}\psi = E\psi \right) \\ \mathbf{v}^{T} \comandoDesconhecido{x}`);
    expect(spoken).not.toMatch(/[\\{}^_$]/);
  });
});

describe('speakMath', () => {
  it('aceita os quatro delimitadores', () => {
    const spoken = speakMath(String.raw`A $x^2$, \(\alpha\), \[\beta\] e $$\gamma$$.`);
    expect(spoken).toContain('x ao quadrado');
    expect(spoken).toContain('alfa');
    expect(spoken).toContain('beta');
    expect(spoken).toContain('gama');
    expect(spoken).not.toMatch(/[\\$]/);
  });

  it('moeda não é matemática', () => {
    expect(speakMath('Custa R$ 10 ou R$ 20.')).toBe('Custa R$ 10 ou R$ 20.');
    expect(speakMath('De $5 a $10.')).toBe('De $5 a $10.');
  });

  it('símbolos Unicode viram nomes em PT-BR', () => {
    const spoken = speakMath('Temos ∫ f ≈ ∑ ψ e ∇φ ≤ x².');
    for (const word of ['integral', 'aproximadamente', 'somatório', 'psi', 'nabla', 'fi', 'menor ou igual a', 'ao quadrado']) {
      expect(spoken).toContain(word);
    }
    expect(spoken).not.toMatch(/[∫≈∑ψ∇φ≤²]/);
  });
});

describe('toSpeakable com matemática', () => {
  it('não corrompe índices de LaTeX com a regra de itálico', () => {
    const spoken = toSpeakable(String.raw`Seja \(\psi_n\) e \(a_n\).`);
    expect(spoken).toBe('Seja psi n e a n.');
  });

  it('Markdown fora da matemática continua sendo removido', () => {
    expect(toSpeakable('A **energia** é $E = mc^2$.')).toBe('A energia é E igual a mc ao quadrado.');
  });
});
