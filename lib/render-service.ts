import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import { sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import type { Element, Root as HastRoot } from 'hast';
import type { Parent } from 'unist';
import { logger } from './logger';
import { getSetting } from './settings';
import {
  assertZetelAtivo,
  listPages,
  makeAnchorFactory,
  segmentFile,
  type SegmentedPage,
} from './ingestao-service';
import { getZetelById, slugify } from './zetel-service';
import { sanitizeSchema } from './sanitize';
const DEFAULT_MAX_WORDS = 1000;
const IMG_BLOCKED = '__blocked__';
const IMG_NOTFOUND = '__notfound__';

export interface RenderResult {
  pagesCount: number;
  outputPath: string;
  sizeBytes: number;
}

interface TocEntry {
  pageIndex: number;
  anchor: string;
  heading: string;
}

interface ZetelFileRow {
  filename: string;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function arquivosDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'arquivos');
}

function artefatosDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'artefatos');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Converte nós MDAST de uma página em HTML sanitizado. */
async function pageNodesToHtml(
  nodes: SegmentedPage['nodes'],
  imageMap: Record<string, string>,
): Promise<string> {
  const subRoot: MdastRoot = { type: 'root', children: nodes };

  const hast = (await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .run(subRoot)) as HastRoot;

  visit(hast, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'img' || !parent || typeof index !== 'number') return;

    const src = String(node.properties?.src ?? '');
    const mapped = src in imageMap ? imageMap[src] : IMG_NOTFOUND;

    const placeholder = (text: string): Element => ({
      type: 'element',
      tagName: 'div',
      properties: { className: ['img-placeholder'] },
      children: [{ type: 'text', value: text }],
    });

    if (mapped === IMG_BLOCKED) {
      (parent as Parent).children[index] = placeholder('⚠ imagem externa bloqueada');
      return;
    }
    if (mapped === IMG_NOTFOUND) {
      (parent as Parent).children[index] = placeholder('⚠ imagem não encontrada');
      return;
    }
    if (mapped.startsWith('images/')) {
      node.properties = { ...node.properties, src: `../${mapped}` };
    }
  });

  const safe = sanitize(hast, sanitizeSchema) as HastRoot;
  return toHtml(safe);
}

function buildViewerCss(): string {
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #fafaf8;
      --bg-side: #f2f2ef;
      --bg-card: #f4f4f1;
      --border: #e3e3df;
      --border-light: #ebebea;
      --text: #1a1a1a;
      --text-2: #555450;
      --text-3: #8a8884;
      --accent: #3b7bdb;
      --accent-dim: #3b7bdb22;
      --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-read: 'Newsreader', Georgia, serif;
      --radius: 6px;
    }
    [data-theme="dark"] {
      --bg: #16161a;
      --bg-side: #1e1e22;
      --bg-card: #1e1e22;
      --border: #2c2c32;
      --border-light: #242428;
      --text: #e8e8e4;
      --text-2: #a0a09c;
      --text-3: #6a6a68;
      --accent: #5a9cf2;
      --accent-dim: #5a9cf222;
    }
    html, body { height: 100%; }
    body {
      display: flex;
      flex-direction: column;
      font-family: var(--font-ui);
      font-size: 14px;
      color: var(--text);
      background: var(--bg);
      line-height: 1.5;
      overflow: hidden;
    }
    #app {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    #toc {
      width: 196px;
      min-width: 196px;
      flex-shrink: 0;
      padding: 1rem;
      overflow-y: auto;
      background: var(--bg-side);
      border-right: 1px solid var(--border);
      font-size: 12.5px;
    }
    #toc .idx-title {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--text-3);
      margin-bottom: 0.75rem;
    }
    #toc ul { list-style: none; }
    #toc a {
      display: block;
      padding: 4px 8px;
      border-radius: var(--radius);
      color: var(--text-2);
      text-decoration: none;
      line-height: 1.45;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #toc a:hover { background: var(--bg-card); color: var(--text); }
    #toc a.active { background: var(--accent-dim); color: var(--accent); font-weight: 550; }
    #reader {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding-bottom: 4rem;
    }
    #reader article.page {
      display: none;
      font-family: var(--font-read);
      font-size: 18px;
      line-height: 1.75;
      max-width: 70ch;
      margin-inline: auto;
      padding: 2rem 1rem;
      color: var(--text);
    }
    #reader article.page.active { display: block; }
    #reader article.page h1 { font-size: 1.8rem; line-height: 1.2; margin: 0 0 1.2rem; font-weight: 500; }
    #reader article.page h2 { font-size: 1.3rem; line-height: 1.3; margin: 2rem 0 0.75rem; font-weight: 500; }
    #reader article.page h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; font-style: italic; font-weight: 400; }
    #reader article.page p { margin-bottom: 1rem; }
    #reader article.page ul, #reader article.page ol { padding-left: 1.4rem; margin-bottom: 1rem; }
    #reader article.page li { margin-bottom: 0.3rem; }
    #reader article.page blockquote {
      border-left: 2.5px solid var(--border);
      padding: 0.4rem 1rem;
      margin: 1.2rem 0;
      color: var(--text-2);
      font-style: italic;
    }
    #reader article.page code {
      font-family: 'Courier New', Consolas, monospace;
      font-size: 0.85em;
      background: var(--bg-card);
      padding: 0.15em 0.4em;
      border-radius: 3px;
    }
    #reader article.page pre {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.25rem;
      line-height: 1.55;
    }
    #reader article.page pre > code { background: none; padding: 0; }
    #reader article.page table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1.25rem;
      font-size: 15px;
      font-family: var(--font-ui);
    }
    #reader article.page th, #reader article.page td {
      border: 1px solid var(--border);
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    #reader article.page th {
      background: var(--bg-card);
      font-weight: 600;
      font-size: 13px;
    }
    #reader article.page img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5rem 0 1rem; }
    #reader article.page a { color: var(--accent); }
    .img-placeholder {
      background: #fef3cd;
      border: 1px solid #f0c040;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.85em;
      margin: 0.5rem 0 1rem;
      font-family: var(--font-ui);
    }
    [data-theme="dark"] .img-placeholder {
      background: #3d3520;
      border-color: #8a7020;
      color: var(--text);
    }
    #nav-bar {
      position: fixed;
      bottom: 0;
      left: 196px;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--bg);
      border-top: 1px solid var(--border-light);
      font-family: var(--font-ui);
      z-index: 10;
    }
    #nav-bar button {
      padding: 0.45rem 1rem;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text-2);
      font-size: 13.5px;
      cursor: pointer;
    }
    #nav-bar button:hover:not(:disabled) { background: var(--bg-card); color: var(--text); }
    #nav-bar button:disabled { opacity: 0.35; cursor: not-allowed; }
    #page-counter { font-size: 13px; color: var(--text-3); min-width: 8rem; text-align: center; }
    @media print {
      #toc, #nav-bar { display: none !important; }
      #reader article.page { display: block !important; page-break-after: always; }
      body { overflow: visible; }
    }
  `;
}

function buildNavScript(): string {
  return `
(function() {
  const pages = document.querySelectorAll('.page');
  const total = pages.length;
  let current = 0;

  function show(n) {
    pages[current].classList.remove('active');
    current = Math.max(0, Math.min(n, total - 1));
    pages[current].classList.add('active');
    document.getElementById('page-counter').textContent =
      'Página ' + (current + 1) + ' de ' + total;
    document.querySelectorAll('#toc a').forEach((a, i) => {
      a.classList.toggle('active', i === current);
    });
    document.getElementById('btn-prev').disabled = current === 0;
    document.getElementById('btn-next').disabled = current === total - 1;
    document.getElementById('reader').scrollTop = 0;
  }

  document.getElementById('btn-prev').addEventListener('click', () => show(current - 1));
  document.getElementById('btn-next').addEventListener('click', () => show(current + 1));
  document.querySelectorAll('#toc a').forEach((a, i) => {
    a.addEventListener('click', (e) => { e.preventDefault(); show(i); });
  });

  show(0);
})();
`.trim();
}

async function assembleHtml(
  displayName: string,
  builtAt: string,
  toc: TocEntry[],
  pageHtmlParts: string[],
): Promise<string> {
  const total = pageHtmlParts.length;
  const tocItems = toc
    .map(
      (e, i) =>
        `<li><a href="#${escapeHtml(e.anchor)}" data-idx="${i}">${escapeHtml(e.heading)}</a></li>`,
    )
    .join('\n');

  const articles = pageHtmlParts
    .map(
      (html, i) =>
        `<article id="${escapeHtml(toc[i].anchor)}" class="page" data-page="${toc[i].pageIndex}">${html}</article>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="zetel-pages" content="${total}">
  <meta name="zetel-built" content="${builtAt}">
  <title>${escapeHtml(displayName)}</title>
  <style>${buildViewerCss()}</style>
</head>
<body>
  <div id="app">
    <nav id="toc">
      <p class="idx-title">Conteúdo</p>
      <ul>${tocItems}</ul>
    </nav>
    <main id="reader">${articles}</main>
  </div>
  <footer id="nav-bar">
    <button type="button" id="btn-prev">← Anterior</button>
    <span id="page-counter">Página 1 de ${total}</span>
    <button type="button" id="btn-next">Próxima →</button>
  </footer>
  <script>${buildNavScript()}</script>
</body>
</html>`;
}

/**
 * Gera `artefatos/leitura.html` a partir de `zetel_pages` + mapa de imagens.
 * Determinístico: mesmo input → mesmo arquivo (Regra #1: sem LLM).
 */
export async function renderZetel(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
): Promise<RenderResult> {
  const builtAt = new Date().toISOString();

  const slug = assertZetelAtivo(db, zetelId);
  const zetel = getZetelById(db, zetelId);
  if (!zetel) {
    throw new Error('Zetel não encontrado.');
  }

  const dbPages = listPages(db, zetelId);
  if (dbPages.length === 0) {
    throw new Error(
      'Este Zetel não tem páginas. Execute "Processar" na aba Arquivos primeiro.',
    );
  }

  const rawMap = getSetting(`image_map_${zetelId}`);
  const imageMap: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};

  const fileRows = db
    .prepare('SELECT filename FROM zetel_files WHERE zetel_id = ? ORDER BY order_index ASC')
    .all(zetelId) as ZetelFileRow[];

  const dir = arquivosDir(vaultPath, slug);
  const maxWords = Number(getSetting('max_words_per_page')) || DEFAULT_MAX_WORDS;
  const anchorOf = makeAnchorFactory(new Set<string>());
  const parser = remark().use(remarkGfm);
  const segmented: SegmentedPage[] = [];

  for (const row of fileRows) {
    const path = join(dir, row.filename);
    if (!existsSync(path)) {
      throw new Error(
        'Um arquivo deste Zetel não foi encontrado em arquivos/ (pode ter sido removido fora do app). ' +
          'Verifique a aba Arquivos e reprocesse.',
      );
    }
    const content = readFileSync(path, 'utf8');
    const tree = parser.parse(content) as MdastRoot;
    const stem = slugify(basename(row.filename, extname(row.filename)));
    segmented.push(...segmentFile(tree, stem, maxWords, segmented.length, anchorOf));
  }

  if (segmented.length !== dbPages.length) {
    throw new Error(
      'A estrutura de páginas não coincide com o banco. Execute "Processar" na aba Arquivos e tente novamente.',
    );
  }

  for (let i = 0; i < dbPages.length; i++) {
    const dbp = dbPages[i];
    const seg = segmented[i];
    if (seg.anchor !== dbp.anchor || sha256(seg.contentText) !== dbp.contentHash) {
      throw new Error(
        'A estrutura de páginas não coincide com o banco. Execute "Processar" na aba Arquivos e tente novamente.',
      );
    }
  }

  const toc: TocEntry[] = dbPages.map((p) => ({
    pageIndex: p.pageIndex,
    anchor: p.anchor,
    heading: p.heading,
  }));

  const pageHtmlParts: string[] = [];
  for (const page of segmented) {
    pageHtmlParts.push(await pageNodesToHtml(page.nodes, imageMap));
  }

  const html = await assembleHtml(zetel.displayName, builtAt, toc, pageHtmlParts);

  const outDir = artefatosDir(vaultPath, slug);
  mkdirSync(outDir, { recursive: true });
  const outputPath = join(outDir, 'leitura.html');
  writeFileSync(outputPath, html, 'utf8');
  const sizeBytes = statSync(outputPath).size;

  db.prepare(
    'UPDATE zetels SET reading_stale = 0, last_built_at = ?, updated_at = ? WHERE id = ?',
  ).run(builtAt, builtAt, zetelId);

  const result: RenderResult = {
    pagesCount: dbPages.length,
    outputPath,
    sizeBytes,
  };

  logger.info('zetel rendered', { zetelId, pages: result.pagesCount, sizeBytes: result.sizeBytes });
  return result;
}

/** Caminho absoluto de `leitura.html` para um slug (sem verificar existência). */
export function leituraHtmlPath(vaultPath: string, slug: string): string {
  return join(artefatosDir(vaultPath, slug), 'leitura.html');
}

/** Metadados dos artefatos sem ler o conteúdo do HTML. */
export function getArtifactsInfo(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
): {
  leituraHtml: {
    exists: boolean;
    sizeBytes: number | null;
    lastBuiltAt: string | null;
    pagesCount: number;
  };
} {
  const slug = assertZetelAtivo(db, zetelId);
  const zetel = getZetelById(db, zetelId);
  const path = leituraHtmlPath(vaultPath, slug);
  const exists = existsSync(path);
  const pagesCount = (
    db.prepare('SELECT COUNT(*) AS c FROM zetel_pages WHERE zetel_id = ?').get(zetelId) as {
      c: number;
    }
  ).c;

  return {
    leituraHtml: {
      exists,
      sizeBytes: exists ? statSync(path).size : null,
      lastBuiltAt: zetel?.lastBuiltAt ?? null,
      pagesCount,
    },
  };
}
