import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import { describe, expect, it } from 'vitest';
import { escapeMarkdownText, htmlToMarkdown } from '@/lib/html-to-markdown';

/** Tipos de nó produzidos pelo mesmo parser remark (GFM + math) do app. */
function parsedTypes(markdown: string): Array<{ type: string; value?: string }> {
  const out: Array<{ type: string; value?: string }> = [];
  visit(remark().use(remarkGfm).use(remarkMath).parse(markdown), (n: Node & { value?: string }) => {
    out.push({ type: n.type, value: n.value });
  });
  return out;
}

const ARTICLE = `<!doctype html>
<html><head><title>Transformada de Fourier – Wikipédia</title>
<style>body{color:red}</style><script>window.evil = 1</script></head>
<body>
<nav><a href="/">Início</a> Menu de navegação</nav>
<header><p>Cabeçalho do site</p></header>
<main>
  <h1>Transformada de Fourier</h1>
  <p>A <strong>transformada</strong> decompõe uma <em>função</em> em
     componentes de <a href="https://example.com/freq">frequência</a>.</p>
  <img src="https://example.com/x.png" alt="figura">
  <h2>Propriedades</h2>
  <ul><li>Linearidade</li><li>Inversão<ul><li>Teorema</li></ul></li></ul>
  <ol><li>Primeiro</li><li>Segundo</li></ol>
  <pre><code class="language-python">def f(x):\n    return x * 2</code></pre>
  <blockquote><p>Citação importante.</p></blockquote>
  <table><thead><tr><th>Nome</th><th>Valor</th></tr></thead>
  <tbody><tr><td>a | b</td><td>1</td></tr><tr><td>c</td></tr></tbody></table>
  <p>Linha um<br>linha dois</p>
  <hr>
  <form><input name="q"><button>Buscar</button></form>
  <iframe src="https://evil.example"></iframe>
  <svg><text>vetor</text></svg>
  <noscript>Ative o JS</noscript>
  <aside>Barra lateral</aside>
</main>
<footer>Rodapé</footer>
</body></html>`;

describe('htmlToMarkdown (SPEC-012 RF2)', () => {
  it('extrai título, prefere <main> e descarta navegação, scripts e imagens', () => {
    const { title, markdown } = htmlToMarkdown(ARTICLE);
    expect(title).toBe('Transformada de Fourier – Wikipédia');
    expect(markdown).toContain('# Transformada de Fourier');
    expect(markdown).toContain('A **transformada** decompõe uma *função* em componentes de frequência.');
    expect(markdown).toContain('## Propriedades');
    for (const banned of [
      'window.evil',
      'color:red',
      'Menu de navegação',
      'Cabeçalho do site',
      'x.png',
      'figura',
      'Buscar',
      'evil.example',
      'vetor',
      'Ative o JS',
      'Barra lateral',
      'Rodapé',
      'https://example.com/freq',
      '](',
      '![',
    ]) {
      expect(markdown).not.toContain(banned);
    }
  });

  it('converte listas, código, citação, tabela, quebra e régua', () => {
    const { markdown } = htmlToMarkdown(ARTICLE);
    expect(markdown).toContain('- Linearidade\n- Inversão\n  - Teorema');
    expect(markdown).toContain('1. Primeiro\n2. Segundo');
    expect(markdown).toContain('```python\ndef f(x):\n    return x * 2\n```');
    expect(markdown).toContain('> Citação importante.');
    expect(markdown).toContain('| Nome | Valor |\n| --- | --- |\n| a \\| b | 1 |\n| c |  |');
    expect(markdown).toContain('Linha um  \nlinha dois');
    expect(markdown).toContain('\n---\n');
  });

  it('cai para <article> e depois <body>', () => {
    expect(htmlToMarkdown('<body><p>fora</p><article><p>dentro</p></article></body>').markdown).toBe('dentro\n');
    expect(htmlToMarkdown('<body><p>só body</p></body>').markdown).toBe('só body\n');
  });

  it('usa o primeiro h1 quando não há <title>', () => {
    expect(htmlToMarkdown('<main><h1>Título do H1</h1><p>texto</p></main>').title).toBe('Título do H1');
    expect(htmlToMarkdown('<p>sem título</p>').title).toBe('');
  });

  it('SPA vazia produz pouco texto', () => {
    const r = htmlToMarkdown('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
    expect(r.textLength).toBe(0);
    expect(r.markdown).toBe('');
  });

  it('conta o texto extraído', () => {
    const r = htmlToMarkdown(`<p>${'a'.repeat(250)}</p>`);
    expect(r.textLength).toBe(250);
  });

  it('escapa sintaxe Markdown, HTML e math vindos do texto da página', () => {
    const { markdown } = htmlToMarkdown(
      '<p>*não negrito* _x_ `y` [z](w) &lt;script&gt;alert(1)&lt;/script&gt; $x^2$ # h ~r~</p>',
    );
    expect(markdown).toBe(
      '\\*não negrito\\* \\_x\\_ \\`y\\` \\[z\\](w) \\<script\\>alert(1)\\</script\\> \\$x^2\\$ \\# h \\~r\\~\n',
    );
  });

  it('não interpreta marcadores de lista ou numeração no início da linha', () => {
    expect(escapeMarkdownText('- item')).toBe('\\- item');
    expect(escapeMarkdownText('+ item')).toBe('\\+ item');
    expect(escapeMarkdownText('1. item')).toBe('1\\. item');
    expect(escapeMarkdownText('a - b')).toBe('a - b');
  });

  it('cerca código que contém ``` com uma cerca maior', () => {
    const { markdown } = htmlToMarkdown('<pre>a\n```\nb</pre>');
    expect(markdown).toBe('````\na\n```\nb\n````\n');
  });

  it('MathML com anotação TeX (Wikipédia) vira math do remark, sem texto duplicado', () => {
    const inline =
      '<p>Seja <math alttext="{\\displaystyle a_{0}}"><semantics><mrow><msub><mi>a</mi><mn>0</mn></msub></mrow>' +
      '<annotation encoding="application/x-tex">{\\displaystyle a_{0}}</annotation></semantics></math> o termo.</p>';
    expect(htmlToMarkdown(inline).markdown).toBe('Seja $a_{0}$ o termo.\n');

    const block =
      '<p>A forma geral:</p><math display="block"><semantics><mi>T</mi>' +
      '<annotation encoding="application/x-tex">{\\displaystyle T(t)=\\sum _{n=1}^{\\infty }b_{n}}</annotation>' +
      '</semantics></math><p>fim</p>';
    expect(htmlToMarkdown(block).markdown).toBe('A forma geral:\n\n$$\nT(t)=\\sum _{n=1}^{\\infty }b_{n}\n$$\n\nfim\n');
  });

  it('MathML sem TeX usa alttext; sem nada, é descartado; TeX com $ não vira math', () => {
    expect(htmlToMarkdown('<p>x <math alttext="b^2"><mi>b</mi></math> y</p>').markdown).toBe('x $b^2$ y\n');
    expect(htmlToMarkdown('<p>x <math><mi>b</mi></math> y</p>').markdown).toBe('x y\n');
    expect(htmlToMarkdown('<p>x <math alttext="a$b"><mi>a</mi></math> y</p>').markdown).toBe('x y\n');
  });

  it('código inline com crases usa cerca maior que qualquer sequência interna (review F001)', () => {
    const { markdown } = htmlToMarkdown('<p><code>a``b</code> ![x](https://evil.example/x.png) <code>`c</code></p>');
    expect(markdown).toBe('```a``b``` !\\[x\\](https://evil.example/x.png) `` `c ``\n');
  });

  it('pipe dentro de código ou TeX em célula de tabela é escapado (review F003)', () => {
    const { markdown } = htmlToMarkdown(
      '<table><tr><th>f</th></tr><tr><td><code>a|b</code> <math alttext="|x|"><mi>x</mi></math></td></tr></table>',
    );
    expect(markdown).toBe('| f |\n| --- |\n| `a\\|b` $\\vert x\\vert$ |\n');
  });

  it('TeX em célula troca | e \\| por \\vert/\\Vert sem confundir \\\\ (review F008)', () => {
    const { markdown } = htmlToMarkdown(
      '<table><tr><th>f</th></tr><tr><td><math alttext="\\|v\\| \\\\|a|"><mi>v</mi></math></td></tr></table>',
    );
    expect(markdown).toBe('| f |\n| --- |\n| $\\Vert v\\Vert \\\\\\vert a\\vert$ |\n');
  });

  it('barra antes de | em código de célula não fecha a célula nem libera imagem (review F009)', () => {
    const { markdown } = htmlToMarkdown(
      '<table><tr><th>f</th></tr><tr><td><code>a\\|![x](https://evil.example/i.png)</code></td>' +
        '<td><code>C:\\dir</code></td></tr></table>',
    );
    const nodes = parsedTypes(markdown);
    expect(nodes.some((n) => n.type === 'image')).toBe(false);
    const codes = nodes.filter((n) => n.type === 'inlineCode').map((n) => n.value);
    expect(codes).toHaveLength(2);
    expect(codes[0]).toContain('![x](https://evil.example/i.png)');
    expect(codes[1]).toBe('C:\\dir'); // barras fora de `\|` ficam intactas
    expect(nodes.filter((n) => n.type === 'tableCell')).toHaveLength(4); // cabeçalho completado a 2 colunas
  });

  it('fora de tabela, TeX mantém | literal', () => {
    expect(htmlToMarkdown('<p><math alttext="|x|"><mi>x</mi></math></p>').markdown).toBe('$|x|$\n');
  });

  it('descarta elementos com atributo hidden', () => {
    expect(htmlToMarkdown('<p>visível</p><div hidden><p>oculto</p></div>').markdown).toBe('visível\n');
  });
});
