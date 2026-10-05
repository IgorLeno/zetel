import { fromHtml } from 'hast-util-from-html';
import type { Element, Nodes, Root } from 'hast';

/**
 * HTML → Markdown determinístico para snapshots de fontes da web (SPEC-012
 * RF2/D4). Sem LLM e sem executar nada da página: `hast-util-from-html` só
 * produz a árvore, e este walker emite um subconjunto pequeno de Markdown.
 *
 * - Prefere `<main>`, depois `<article>`, depois `<body>`.
 * - Descarta navegação, scripts, formulários, mídia e imagens (regra #8).
 * - Links viram só texto; texto da página é escapado para não virar sintaxe
 *   Markdown, HTML bruto ou math (`$`) no pipeline remark.
 */

export interface HtmlToMarkdownResult {
  /** `<title>` ou, na falta dele, o primeiro `<h1>`; `''` se nenhum. */
  title: string;
  /** Corpo em Markdown (sem frontmatter), terminando em `\n` quando não vazio. */
  markdown: string;
  /** Caracteres de texto extraídos (espaços colapsados), para detectar SPA vazia. */
  textLength: number;
}

const DROPPED = new Set([
  'script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'iframe', 'svg', 'noscript',
  'img', 'picture', 'video', 'audio', 'source', 'track', 'canvas', 'object', 'embed', 'template',
  'button', 'input', 'select', 'textarea', 'label', 'dialog', 'link', 'meta', 'head', 'map', 'area',
]);

const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'main', 'body', 'html', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'pre', 'blockquote', 'table', 'hr', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  'details', 'summary', 'center', 'address', 'fieldset', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
]);

/** Escapa texto da página para que permaneça texto literal no Markdown. */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/[\\`*_[\]<>#$~|]/g, '\\$&')
    .replace(/^([-+])(?=\s)/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s)/, '$1\\$2');
}

function isElement(node: Nodes): node is Element {
  return node.type === 'element';
}

function shouldDrop(el: Element): boolean {
  return DROPPED.has(el.tagName) || el.properties?.hidden != null && el.properties.hidden !== false;
}

function findFirst(node: Nodes, tag: string): Element | null {
  if (isElement(node) && node.tagName === tag) return node;
  if ('children' in node) {
    for (const child of node.children) {
      if (isElement(child) && shouldDrop(child) && child.tagName !== 'head') continue;
      const hit = findFirst(child as Nodes, tag);
      if (hit) return hit;
    }
  }
  return null;
}

/** Texto bruto de um nó (para `<pre>`, `<title>`), ignorando elementos descartados. */
function rawText(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if (isElement(node) && node.tagName !== 'title' && shouldDrop(node)) return '';
  if ('children' in node) return node.children.map((c) => rawText(c as Nodes)).join('');
  return '';
}

const collapse = (s: string) => s.replace(/\s+/g, ' ');

function bracesBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * TeX de um `<math>` (MathML): anotação `application/x-tex` (Wikipédia), senão
 * `alttext`. Sem TeX — ou com `$`, que fecharia o delimitador — o nó é
 * descartado em vez de despejar o texto MathML duplicado.
 */
function mathTex(el: Element): string | null {
  const stack: Nodes[] = [el];
  let annotation: Element | null = null;
  while (stack.length && !annotation) {
    const node = stack.pop()!;
    if (isElement(node) && node.tagName === 'annotation' && node.properties?.encoding === 'application/x-tex') {
      annotation = node;
    } else if ('children' in node) {
      stack.push(...(node.children as Nodes[]));
    }
  }
  let tex = (annotation ? rawText(annotation) : String(el.properties?.alttext ?? '')).trim();
  const wrapped = tex.match(/^\{\\displaystyle\s*([\s\S]*)\}$/);
  if (wrapped && bracesBalanced(wrapped[1]!)) tex = wrapped[1]!.trim();
  if (!tex || tex.includes('$')) return null;
  return tex;
}

function isDisplayMath(node: Nodes): boolean {
  return isElement(node) && node.tagName === 'math' && node.properties?.display === 'block';
}

/**
 * Em célula GFM, `|` corta a célula. O parser só desfaz `\|` em código inline,
 * não em math; por isso o TeX usa `\vert`/`\Vert` (preservando `\\`).
 */
function texForTableCell(tex: string): string {
  return tex.replace(/\\.|\|/g, (t) => (t === '\\|' ? '\\Vert ' : t === '|' ? '\\vert ' : t));
}

class Walker {
  textLength = 0;
  /** Dentro de célula de tabela: `|` de código/TeX precisa de tratamento. */
  inTableCell = false;

  /** Conteúdo inline de um nó, já escapado; quebras `<br>` viram hard break. */
  inline(node: Nodes): string {
    if (node.type === 'text') {
      const text = collapse(node.value);
      this.textLength += text.trim().length;
      return escapeMarkdownText(text);
    }
    if (!isElement(node) || shouldDrop(node)) return '';
    const inner = () => node.children.map((c) => this.inline(c as Nodes)).join('');
    switch (node.tagName) {
      case 'br':
        return '  \n';
      case 'strong':
      case 'b':
        return wrap(inner(), '**');
      case 'em':
      case 'i':
        return wrap(inner(), '*');
      case 'math': {
        const tex = mathTex(node);
        if (!tex) return '';
        this.textLength += tex.length;
        return `$${collapse(this.inTableCell ? texForTableCell(tex) : tex).trim()}$`;
      }
      case 'code': {
        const code = collapse(rawText(node));
        this.textLength += code.trim().length;
        if (!code.trim()) return '';
        // Cerca maior que qualquer sequência de crases do conteúdo: senão o span
        // fecha antes e o resto vira Markdown ativo (imagem, HTML, math).
        const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
        const fence = '`'.repeat(longest + 1);
        const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
        // Em célula, o tokenizer GFM lê `\\` como par de escape antes do `|`: as
        // barras que precedem um pipe são dobradas e o pipe é escapado, senão a
        // célula fecha no meio do código e o resto vira Markdown ativo.
        const body = this.inTableCell ? code.replace(/(\\*)\|/g, (_m, bs: string) => `${bs}${bs}\\|`) : code;
        return `${fence}${pad}${body}${pad}${fence}`;
      }
      default:
        return inner();
    }
  }

  /** Renderiza os filhos como blocos Markdown, agrupando inline em parágrafos. */
  blocks(parent: Element | Root): string[] {
    const out: string[] = [];
    let para = '';
    const flush = () => {
      const text = para
        .split('\n')
        .map((line) => line.replace(/^ +/, ''))
        .join('\n')
        .replace(/ {2,}(?!\n)/g, ' ')
        .trim();
      if (text) out.push(text);
      para = '';
    };
    for (const child of parent.children) {
      const node = child as Nodes;
      if (isElement(node) && shouldDrop(node)) continue;
      if (isDisplayMath(node)) {
        flush();
        const tex = mathTex(node as Element);
        if (tex) {
          this.textLength += tex.length;
          out.push(`$$\n${tex}\n$$`);
        }
      } else if (isElement(node) && BLOCK.has(node.tagName)) {
        flush();
        out.push(...this.block(node));
      } else {
        para += this.inline(node);
      }
    }
    flush();
    return out;
  }

  block(el: Element): string[] {
    const tag = el.tagName;
    if (/^h[1-6]$/.test(tag)) {
      const text = this.inlineFlat(el);
      return text ? [`${'#'.repeat(Number(tag[1]))} ${text}`] : [];
    }
    switch (tag) {
      case 'ul':
      case 'ol':
        return this.list(el);
      case 'pre':
        return this.pre(el);
      case 'blockquote':
        return this.prefixed(this.blocks(el).join('\n\n'), '> ');
      case 'table':
        return this.table(el);
      case 'hr':
        return ['---'];
      case 'dt': {
        const text = this.inlineFlat(el);
        return text ? [`**${text}**`] : [];
      }
      default:
        return this.blocks(el);
    }
  }

  inlineFlat(el: Element): string {
    return collapse(el.children.map((c) => this.inline(c as Nodes)).join('').replace(/ {2}\n/g, ' ')).trim();
  }

  cell(el: Element): string {
    this.inTableCell = true;
    try {
      return this.inlineFlat(el);
    } finally {
      this.inTableCell = false;
    }
  }

  list(el: Element): string[] {
    const ordered = el.tagName === 'ol';
    const items = el.children.filter((c): c is Element => isElement(c as Nodes) && (c as Element).tagName === 'li');
    const lines: string[] = [];
    items.forEach((li, i) => {
      const marker = ordered ? `${i + 1}. ` : '- ';
      const pad = ' '.repeat(marker.length);
      const parts = this.blocks(li);
      if (parts.length === 0) return;
      const body = parts.join('\n').split('\n');
      lines.push(marker + body[0], ...body.slice(1).map((l) => (l ? pad + l : l)));
    });
    return lines.length ? [lines.join('\n')] : [];
  }

  pre(el: Element): string[] {
    const code = rawText(el).replace(/^\n/, '').replace(/\s+$/, '');
    if (!code) return [];
    this.textLength += collapse(code).trim().length;
    const codeEl = el.children.find((c) => isElement(c as Nodes) && (c as Element).tagName === 'code') as
      | Element
      | undefined;
    const classes = codeEl?.properties?.className;
    const langClass = Array.isArray(classes)
      ? classes.map(String).find((c) => c.startsWith('language-'))
      : undefined;
    const lang = langClass ? langClass.slice('language-'.length).replace(/[^\w+-]/g, '') : '';
    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return [`${fence}${lang}\n${code}\n${fence}`];
  }

  prefixed(text: string, prefix: string): string[] {
    if (!text) return [];
    return [text.split('\n').map((l) => (l ? prefix + l : prefix.trimEnd())).join('\n')];
  }

  table(el: Element): string[] {
    const rows: string[][] = [];
    const collect = (node: Element) => {
      for (const c of node.children) {
        if (!isElement(c as Nodes)) continue;
        const child = c as Element;
        if (child.tagName === 'tr') {
          rows.push(
            child.children
              .filter((cell): cell is Element => isElement(cell as Nodes) && ['td', 'th'].includes((cell as Element).tagName))
              .map((cell) => this.cell(cell)),
          );
        } else if (['thead', 'tbody', 'tfoot'].includes(child.tagName)) {
          collect(child);
        }
      }
    };
    collect(el);
    const width = Math.max(0, ...rows.map((r) => r.length));
    if (rows.length === 0 || width === 0) return [];
    const line = (cells: string[]) =>
      `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
    const [head, ...body] = rows;
    return [[line(head!), line(Array(width).fill('---')), ...body.map(line)].join('\n')];
  }
}

function wrap(text: string, mark: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const lead = text.startsWith(' ') ? ' ' : '';
  const trail = text.endsWith(' ') ? ' ' : '';
  return `${lead}${mark}${trimmed}${mark}${trail}`;
}

export function htmlToMarkdown(html: string): HtmlToMarkdownResult {
  const tree = fromHtml(html);

  const titleEl = findFirst(tree, 'title');
  const h1 = findFirst(tree, 'h1');
  const title = collapse(rawText(titleEl ?? h1 ?? { type: 'text', value: '' })).trim();

  const root = findFirst(tree, 'main') ?? findFirst(tree, 'article') ?? findFirst(tree, 'body') ?? tree;
  const walker = new Walker();
  const blocks = walker.blocks(root);
  const markdown = blocks.length ? `${blocks.join('\n\n')}\n` : '';
  return { title, markdown, textLength: walker.textLength };
}
