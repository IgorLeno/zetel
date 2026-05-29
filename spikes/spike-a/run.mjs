#!/usr/bin/env node
/**
 * Spike A — Pipeline Markdown → HTML paginado
 * Uso: node run.mjs inputs/medio.md [--max-words=1000]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import { sanitize, defaultSchema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const inputArg = args.find(a => !a.startsWith('--'));
const maxWordsArg = args.find(a => a.startsWith('--max-words='));
const MAX_WORDS = maxWordsArg ? parseInt(maxWordsArg.split('=')[1], 10) : 1000;

if (!inputArg) {
  console.error('Uso: node run.mjs <input.md> [--max-words=1000]');
  process.exit(1);
}

const inputPath = join(__dirname, inputArg);
const outputName = basename(inputArg, extname(inputArg)) + '.html';
const outputDir = join(__dirname, 'outputs');
const outputPath = join(outputDir, outputName);

mkdirSync(outputDir, { recursive: true });

// ── Read input ────────────────────────────────────────────────────────────────
const markdown = readFileSync(inputPath, 'utf-8');

// ── Build hast (markdown → mdast → hast com slugs) ───────────────────────────
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSlug);

const mdast = processor.parse(markdown);
const hast = await processor.run(mdast);

// ── Collect mini-index headings (antes de sanitizar) ─────────────────────────
const headings = [];
visit(hast, 'element', (node) => {
  if (/^h[1-4]$/.test(node.tagName)) {
    headings.push({
      level: parseInt(node.tagName[1], 10),
      id: String(node.properties?.id ?? ''),
      text: toString(node).trim(),
    });
  }
});

// ── Substituir imagens externas por placeholder (DT2) ────────────────────────
const PLACEHOLDER_SVG = [
  'data:image/svg+xml,',
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="64">' +
    '<rect width="480" height="64" fill="#f0f0ec" rx="4"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
    'font-family="sans-serif" font-size="13" fill="#999">' +
    '⚠ imagem externa bloqueada</text></svg>'
  ),
].join('');

visit(hast, 'element', (node) => {
  if (node.tagName === 'img') {
    const src = String(node.properties?.src ?? '');
    if (src.startsWith('http://') || src.startsWith('https://')) {
      node.properties['data-blocked-src'] = src;
      node.properties.src = PLACEHOLDER_SVG;
      node.properties.alt = '⚠ imagem externa bloqueada';
      if (!node.properties.className) node.properties.className = [];
      node.properties.className.push('blocked-image');
    }
  }
});

// ── Sanitize schema: preserva id nos headings, bloqueia <script> ──────────────
const sanitizeSchema = {
  ...defaultSchema,
  // Remover 'id' do clobber para preservar os slugs gerados pelo rehype-slug
  clobber: (defaultSchema.clobber ?? []).filter(c => c !== 'id'),
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'className'],
    img: ['src', 'alt', 'title', 'width', 'height', 'className', 'data-blocked-src'],
    code: ['className'],
    pre: ['className'],
    a: ['href', 'id', 'className', 'aria-hidden', 'tabIndex'],
    span: ['aria-hidden', 'className'],
  },
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), 'span', 'section', 'article'])],
};

// ── Contar palavras num nó hast ───────────────────────────────────────────────
function countWords(node) {
  return toString(node).split(/\s+/).filter(Boolean).length;
}

// ── Paginar: dividir root.children em páginas ─────────────────────────────────
function paginate(rootChildren, maxWords) {
  const pages = [];
  let buf = [];
  let wordCount = 0;

  for (const node of rootChildren) {
    // Nós de texto/whitespace: anexar à página corrente sem contar
    if (node.type !== 'element') {
      if (buf.length > 0) buf.push(node);
      continue;
    }

    const isBreakPoint = node.tagName === 'h1' || node.tagName === 'h2';
    const nodeWords = countWords(node);

    if (isBreakPoint && buf.length > 0) {
      // Começar nova página no H1/H2
      pages.push(buf);
      buf = [node];
      wordCount = nodeWords;
    } else if (!isBreakPoint && wordCount >= maxWords && buf.length > 0) {
      // Limite de palavras atingido
      pages.push(buf);
      buf = [node];
      wordCount = nodeWords;
    } else {
      buf.push(node);
      wordCount += nodeWords;
    }
  }

  if (buf.length > 0) pages.push(buf);
  return pages;
}

const pages = paginate(hast.children, MAX_WORDS);
const totalPages = pages.length;

// ── Título do documento ───────────────────────────────────────────────────────
const firstH1 = headings.find(h => h.level === 1);
const docTitle = firstH1?.text ?? basename(inputArg, extname(inputArg));

// ── Renderizar cada página para HTML ─────────────────────────────────────────
function renderPage(nodes) {
  const pageRoot = { type: 'root', children: nodes };
  const sanitized = sanitize(pageRoot, sanitizeSchema);
  return toHtml(sanitized);
}

const pageHtmls = pages.map(renderPage);

// ── Mini-índice HTML ──────────────────────────────────────────────────────────
function buildMiniIndex(headings) {
  if (headings.length === 0) return '<p class="idx-empty">Sem seções</p>';
  const items = headings.map(h => {
    const indent = (h.level - 1) * 14;
    const cls = `idx-item idx-h${h.level}`;
    return `<li class="${cls}" style="padding-left:${indent}px">` +
      `<a href="#" class="idx-link" data-anchor="${h.id}">${escapeHtml(h.text)}</a>` +
      `</li>`;
  }).join('\n    ');
  return `<ul class="idx-list">\n    ${items}\n  </ul>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const miniIndexHtml = buildMiniIndex(headings);

// ── Seções de páginas HTML ────────────────────────────────────────────────────
const pageSections = pageHtmls.map((html, i) => {
  const active = i === 0 ? ' active' : '';
  return `    <section class="page${active}" id="page-${i + 1}" data-page="${i + 1}">\n${html}\n    </section>`;
}).join('\n\n');

// ── Montar HTML final autocontido ─────────────────────────────────────────────
const finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 17px;
      line-height: 1.75;
      color: #1c1c1c;
      background: #fafaf8;
      display: flex;
      min-height: 100vh;
    }

    /* ── Mini-índice ── */
    .mini-index {
      width: 220px;
      min-width: 220px;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 2rem 1rem 2rem 1.25rem;
      background: #f4f4f2;
      border-right: 1px solid #e2e2de;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12.5px;
    }

    .idx-title {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 0.75rem;
    }

    .idx-list { list-style: none; }
    .idx-item { margin-bottom: 0.2rem; }
    .idx-empty { color: #aaa; font-size: 12px; font-style: italic; }

    .idx-link {
      color: #666;
      text-decoration: none;
      display: block;
      padding: 3px 6px;
      border-radius: 3px;
      line-height: 1.4;
      transition: background 0.1s, color 0.1s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .idx-link:hover { background: #eaeae8; color: #1c1c1c; }
    .idx-link.active { background: #2563eb1a; color: #2563eb; font-weight: 600; }

    /* ── Área de conteúdo ── */
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 3rem 4rem 3rem 3rem;
      max-width: 800px;
    }

    /* ── Páginas ── */
    .page { display: none; flex: 1; }
    .page.active { display: block; }

    /* ── Tipografia ── */
    .page h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1.25rem; color: #111; }
    .page h2 { font-size: 1.45rem; line-height: 1.3; margin: 2rem 0 0.85rem; color: #111; }
    .page h3 { font-size: 1.15rem; line-height: 1.4; margin: 1.5rem 0 0.6rem; color: #1c1c1c; }
    .page h4 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #333; font-style: italic; }
    .page p { margin-bottom: 1rem; max-width: 68ch; }
    .page ul, .page ol { margin-bottom: 1rem; padding-left: 1.5rem; max-width: 68ch; }
    .page li { margin-bottom: 0.3rem; }
    .page li > ul, .page li > ol { margin-top: 0.3rem; margin-bottom: 0; }

    .page blockquote {
      border-left: 3px solid #ccc;
      margin: 1.25rem 0;
      padding: 0.5rem 1.25rem;
      color: #555;
      font-style: italic;
      max-width: 68ch;
    }

    .page pre {
      background: #f0f0ec;
      border: 1px solid #e0e0dc;
      border-radius: 5px;
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.25rem;
      line-height: 1.55;
    }
    .page code {
      font-family: 'Courier New', Consolas, 'Liberation Mono', monospace;
      font-size: 0.88em;
    }
    .page pre > code { font-size: 13px; background: none; padding: 0; }
    .page :not(pre) > code {
      background: #eeeeed;
      padding: 0.15em 0.35em;
      border-radius: 3px;
    }

    .page table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1.25rem;
      font-size: 15px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .page th, .page td {
      border: 1px solid #ddd;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    .page th { background: #f0f0ec; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
    .page tr:nth-child(even) td { background: #f9f9f7; }

    .page img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5rem 0 1rem; }
    .page img.blocked-image {
      display: block;
      border: 1px dashed #ccc;
      padding: 0.5rem;
      background: #f8f8f6;
      border-radius: 4px;
    }

    .page hr { border: none; border-top: 1px solid #e0e0dc; margin: 1.5rem 0; }
    .page a { color: #2563eb; }

    /* ── Barra de navegação ── */
    .nav-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #e0e0dc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      flex-shrink: 0;
    }

    .nav-btn {
      background: none;
      border: 1px solid #ccc;
      padding: 0.45rem 1rem;
      border-radius: 5px;
      cursor: pointer;
      font-size: 13.5px;
      color: #333;
      transition: background 0.1s, border-color 0.1s;
    }
    .nav-btn:hover:not(:disabled) { background: #f0f0ec; border-color: #bbb; }
    .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

    .page-indicator {
      font-size: 13px;
      color: #999;
    }
  </style>
</head>
<body>
  <aside class="mini-index">
    <p class="idx-title">Conteúdo</p>
    ${miniIndexHtml}
  </aside>
  <main class="content-area">
${pageSections}

    <nav class="nav-bar">
      <button class="nav-btn" id="btn-prev" disabled>← Anterior</button>
      <span class="page-indicator" id="page-indicator">Página 1 de ${totalPages}</span>
      <button class="nav-btn" id="btn-next"${totalPages <= 1 ? ' disabled' : ''}>Próxima →</button>
    </nav>
  </main>
  <script>
    (function () {
      var total = ${totalPages};
      var cur = 1;

      function showPage(n) {
        if (n < 1 || n > total) return;
        document.querySelectorAll('.page').forEach(function (el) {
          el.classList.remove('active');
        });
        var target = document.getElementById('page-' + n);
        if (target) target.classList.add('active');
        document.getElementById('btn-prev').disabled = (n <= 1);
        document.getElementById('btn-next').disabled = (n >= total);
        document.getElementById('page-indicator').textContent = 'Página ' + n + ' de ' + total;
        cur = n;
        history.replaceState(null, '', '#page-' + n);
        window.scrollTo(0, 0);
        updateActiveIdx();
      }

      function updateActiveIdx() {
        var section = document.querySelector('.page.active');
        document.querySelectorAll('.idx-link').forEach(function (a) { a.classList.remove('active'); });
        if (!section) return;
        var firstId = section.querySelector('[id]');
        if (!firstId) return;
        var link = document.querySelector('.idx-link[data-anchor="' + firstId.id + '"]');
        if (link) link.classList.add('active');
      }

      document.getElementById('btn-prev').addEventListener('click', function () { showPage(cur - 1); });
      document.getElementById('btn-next').addEventListener('click', function () { showPage(cur + 1); });

      // Mini-índice: encontrar em qual página está o heading e navegar
      document.querySelectorAll('.idx-link').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var anchor = this.dataset.anchor;
          for (var i = 1; i <= total; i++) {
            var page = document.getElementById('page-' + i);
            if (page && page.querySelector('#' + CSS.escape(anchor))) {
              showPage(i);
              return;
            }
          }
        });
      });

      // Restaurar página do hash
      var hash = location.hash;
      if (hash && hash.startsWith('#page-')) {
        var n = parseInt(hash.slice(6), 10);
        if (n >= 1 && n <= total) { showPage(n); return; }
      }
      showPage(1);

      // Teclado
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') showPage(cur + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   showPage(cur - 1);
      });
    })();
  </script>
</body>
</html>`;

writeFileSync(outputPath, finalHtml, 'utf-8');

console.log(`✓ ${outputPath}`);
console.log(`  Páginas: ${totalPages} | Headings no mini-índice: ${headings.length} | Max palavras/página: ${MAX_WORDS}`);
