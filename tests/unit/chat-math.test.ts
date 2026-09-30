import { describe, expect, it } from 'vitest';
import { renderChatMath, splitMath } from '@/lib/chat-math';

describe('splitMath', () => {
  it('reconhece os quatro delimitadores', () => {
    const parts = splitMath(String.raw`a $x^2$ b \(y\) c \[z\] d $$w$$ e`);
    expect(parts.filter((p) => p.kind === 'math')).toEqual([
      { kind: 'math', tex: 'x^2', display: false, raw: '$x^2$' },
      { kind: 'math', tex: 'y', display: false, raw: String.raw`\(y\)` },
      { kind: 'math', tex: 'z', display: true, raw: String.raw`\[z\]` },
      { kind: 'math', tex: 'w', display: true, raw: '$$w$$' },
    ]);
    expect(parts.map((p) => (p.kind === 'text' ? p.text : p.raw)).join(''))
      .toBe(String.raw`a $x^2$ b \(y\) c \[z\] d $$w$$ e`);
  });

  it('moeda e texto sem delimitador ficam como texto', () => {
    for (const text of ['Custa R$ 10 ou R$ 20.', 'De $5 a $10.', 'Sem matemática aqui.']) {
      expect(splitMath(text)).toEqual([{ kind: 'text', text }]);
    }
  });

  it('delimitador ainda aberto no streaming continua texto', () => {
    expect(splitMath(String.raw`A integral \(\int_0^1`)).toEqual([
      { kind: 'text', text: String.raw`A integral \(\int_0^1` },
    ]);
  });
});

describe('renderChatMath', () => {
  it('renderiza LaTeX comum', () => {
    const html = renderChatMath(String.raw`\frac{1}{3} \approx \psi_n`, false);
    expect(html).toContain('class="katex"');
  });

  it('LaTeX inválido devolve null (o chat mostra o texto cru)', () => {
    expect(renderChatMath(String.raw`\frac{1}{`, false)).toBeNull();
  });

  it('trust:false bloqueia link, html e imagem', () => {
    const attacks = [
      String.raw`\href{javascript:alert(1)}{x}`,
      String.raw`\url{javascript:alert(1)}`,
      String.raw`\htmlClass{x}{y}`,
      String.raw`\htmlData{onload=alert(1)}{y}`,
      String.raw`\includegraphics{https://evil.test/x.png}`,
      String.raw`\text{<script>alert(1)</script>}`,
    ];
    for (const tex of attacks) {
      const html = renderChatMath(tex, false) ?? '';
      // O MathML repete o TeX original em <annotation>, escapado (texto inerte).
      const annotation = /<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/.exec(html)?.[1] ?? '';
      expect(annotation).not.toMatch(/[<>]/);
      const markup = html.replace(/<annotation[\s\S]*?<\/annotation>/g, '');
      expect(markup).not.toMatch(/<script|javascript:|<a\s|href=|<img|onload=|data-onload/i);
    }
  });

  it('limita expansão de macros', () => {
    const bomb = String.raw`\def\a{xxxxxxxx}\def\b{\a\a\a\a\a\a\a\a}\def\c{\b\b\b\b\b\b\b\b}\c\c\c\c\c`;
    expect(renderChatMath(bomb, false)).toBeNull();
  });
});
