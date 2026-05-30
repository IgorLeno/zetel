import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join } from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import type { Element, Root as HastRoot, RootContent as HastContent } from 'hast';
import type { Parent } from 'unist';
import type { LanguageFn } from 'highlight.js';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';
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

/**
 * Subset de linguagens do highlight.js (Spike 9.1, decisão aprovada). `detect:false`
 * → só blocos com linguagem reconhecida recebem highlight; ` ```mermaid ` e demais
 * ficam como código simples (fallback via CSS). Manter enxuto = bundle pequeno e
 * determinístico (Regra #1: sem LLM).
 */
const HLJS_LANGUAGES: Record<string, LanguageFn> = {
  javascript,
  typescript,
  python,
  bash,
  json,
  sql,
  rust,
};

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

// ---------------------------------------------------------------------------
// CSS de assets (KaTeX + highlight.js) — lido dos pacotes em build time,
// cacheado por processo. É conteúdo estático de dependência (não de usuário),
// então o cache não fere a Regra #5 (que trata da memória do parceiro).
// ---------------------------------------------------------------------------

let cachedAssetCss: string | null = null;

/** Diretório raiz de um pacote instalado (robusto a pnpm; fallback p/ cwd). */
function pkgDir(pkg: string): string {
  try {
    const req = createRequire(import.meta.url);
    return dirname(req.resolve(`${pkg}/package.json`));
  } catch {
    return join(process.cwd(), 'node_modules', pkg);
  }
}

/**
 * Inlina as fontes WOFF2 do KaTeX como data: URIs (decisão do usuário: só woff2).
 * As `url(fonts/*.woff)`/`*.ttf` restantes ficam relativas mas nunca são buscadas:
 * o browser usa o primeiro formato suportado (woff2) → leitura 100% offline.
 */
function inlineKatexWoff2(css: string, fontsDir: string): string {
  return css.replace(/url\((fonts\/[^)'"]+\.woff2)\)/g, (match, rel: string) => {
    const fontPath = join(fontsDir, basename(rel));
    if (!existsSync(fontPath)) return match;
    const b64 = readFileSync(fontPath).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  });
}

/**
 * Escopa cada seletor de um CSS sob `[data-theme="dark"]` (preservando comentários),
 * para o tema escuro do highlight.js conviver com o claro. Porte do Spike 9.1
 * (`run-highlight.mjs`, `scopeDarkSelectors`).
 */
function scopeDarkSelectors(css: string): string {
  const scope = '[data-theme="dark"]';
  const commentRe = /\/\*[\s\S]*?\*\//g;

  const scopeChunk = (chunk: string): string =>
    chunk.replace(/(?:^|})\s*([^{}@][^{}]*?)\s*\{/g, (match, sel: string) => {
      const brace = match.startsWith('}') ? '}' : '';
      const scoped = sel
        .split(',')
        .map((s) => `${scope} ${s.trim()}`)
        .join(', ');
      return `${brace}\n${scoped} {`;
    });

  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = commentRe.exec(css)) !== null) {
    out += scopeChunk(css.slice(last, m.index));
    out += m[0];
    last = m.index + m[0].length;
  }
  out += scopeChunk(css.slice(last));
  return out;
}

/** CSS do KaTeX (com fontes woff2 inline) + highlight.js claro + escuro escopado. */
function loadAssetCss(): string {
  if (cachedAssetCss !== null) return cachedAssetCss;

  const katexDist = join(pkgDir('katex'), 'dist');
  let katexCss = readFileSync(join(katexDist, 'katex.min.css'), 'utf8');
  katexCss = inlineKatexWoff2(katexCss, join(katexDist, 'fonts'));

  const hljsStyles = join(pkgDir('highlight.js'), 'styles');
  const hljsLight = readFileSync(join(hljsStyles, 'github.css'), 'utf8');
  const hljsDark = scopeDarkSelectors(readFileSync(join(hljsStyles, 'github-dark.css'), 'utf8'));

  cachedAssetCss = `/* katex */\n${katexCss}\n/* hljs claro */\n${hljsLight}\n/* hljs escuro */\n${hljsDark}`;
  return cachedAssetCss;
}

// ---------------------------------------------------------------------------
// Pipeline de página (determinístico — Regra #1: sem LLM)
// ---------------------------------------------------------------------------

function classNames(node: Element): string[] {
  const c = node.properties?.className;
  if (Array.isArray(c)) return c.map(String);
  if (typeof c === 'string') return [c];
  return [];
}

function countTr(node: HastContent): number {
  let n = 0;
  visit({ type: 'root', children: [node] } as HastRoot, 'element', (el: Element) => {
    if (el.tagName === 'tr') n++;
  });
  return n;
}

/** Converte nós MDAST de uma página em HTML sanitizado (KaTeX + highlight.js). */
async function pageNodesToHtml(
  nodes: SegmentedPage['nodes'],
  imageMap: Record<string, string>,
): Promise<string> {
  const subRoot: MdastRoot = { type: 'root', children: nodes };

  // Ordem (Etapa 9.2): remark-rehype → rehype-katex → rehype-slug → rehype-highlight.
  // Os nós math já vêm parseados (remark-math na segmentação) com data.hName, então
  // remark-rehype os converte em <span class="math-inline/display"> e rehype-katex
  // renderiza. highlight.js sobrevive ao sanitize sem extensão de schema.
  const hast = (await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeKatex)
    .use(rehypeSlug)
    .use(rehypeHighlight, { languages: HLJS_LANGUAGES, detect: false })
    .run(subRoot)) as HastRoot;

  // Imagens: reescrita de src ou placeholder (DT2).
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

  // Tabelas: embrulha em .table-wrap (overflow-x) e marca sticky se > 10 linhas.
  visit(hast, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'table' || !parent || typeof index !== 'number') return;
    if (
      parent.type === 'element' &&
      (parent as Element).tagName === 'div' &&
      classNames(parent as Element).includes('table-wrap')
    ) {
      return; // já embrulhada — evita re-wrap ao descer na árvore
    }

    const cls = ['reading-table'];
    if (countTr(node) > 10) cls.push('reading-table--sticky');
    node.properties = { ...node.properties, className: [...classNames(node), ...cls] };

    (parent as Parent).children[index] = {
      type: 'element',
      tagName: 'div',
      properties: { className: ['table-wrap'] },
      children: [node],
    } as Element;
  });

  const safe = sanitize(hast, sanitizeSchema) as HastRoot;
  return toHtml(safe);
}

// ---------------------------------------------------------------------------
// Template (CSS + scripts) — tudo inline, sem CDN (Restrição #1)
// ---------------------------------------------------------------------------

/** Vars do tema escuro, reusadas em [data-theme="dark"] e no fallback prefers. */
const DARK_VARS = `
  --bg:#16161a; --bg-side:#1e1e22; --bg-card:#1e1e22; --bg-hover:#25252a;
  --border:#2c2c32; --border-light:#242428;
  --text:#e8e8e4; --text-2:#a0a09c; --text-3:#6a6a68;
  --accent:#5a9cf2; --accent-dim:#5a9cf222; --quote-bg:#1c1c20;`;

function buildViewerCss(): string {
  return `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#fafaf8; --bg-side:#f2f2ef; --bg-card:#f4f4f1; --bg-hover:#eaeae7;
      --border:#e3e3df; --border-light:#ebebea;
      --text:#1a1a1a; --text-2:#555450; --text-3:#8a8884;
      --accent:#3b7bdb; --accent-dim:#3b7bdb22; --quote-bg:#f3f3f0;
      --font-ui:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      --font-read:Georgia,'Times New Roman',serif;
      --radius:6px;
    }
    [data-theme="dark"]{${DARK_VARS}}
    @media (prefers-color-scheme:dark){:root:not([data-theme]){${DARK_VARS}}}
    html,body{height:100%}
    body{display:flex;flex-direction:column;font-family:var(--font-ui);font-size:14px;color:var(--text);background:var(--bg);line-height:1.5;overflow:hidden}
    #app{display:flex;flex:1;min-height:0;overflow:hidden}
    #toc{width:210px;min-width:210px;flex-shrink:0;padding:1.1rem 1rem;overflow-y:auto;background:var(--bg-side);border-right:1px solid var(--border);font-size:12.5px}
    #toc .idx-title{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text-3);margin-bottom:.75rem}
    #toc ul{list-style:none}
    #toc a{display:block;padding:5px 9px;border-radius:var(--radius);color:var(--text-2);text-decoration:none;line-height:1.45;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #toc a:hover{background:var(--bg-card);color:var(--text)}
    #toc a.active{background:var(--accent-dim);color:var(--accent);font-weight:550}
    .toc-select{display:none;font:inherit}
    #reader{flex:1;overflow-y:auto;min-height:0;padding-bottom:5rem}
    article.page{display:none;font-family:var(--font-read);font-size:18px;line-height:1.7;max-width:65ch;margin-inline:auto;padding:2.4rem 1.25rem;color:var(--text);text-wrap:pretty}
    article.page.active{display:block}
    article.page h1,article.page h2,article.page h3{font-family:var(--font-read);text-wrap:pretty;color:var(--text)}
    article.page h1{font-size:2.1rem;line-height:1.15;margin:0 0 1.3rem;font-weight:600;letter-spacing:-.01em}
    article.page h2{font-size:1.45rem;line-height:1.25;margin:2.2rem 0 .8rem;font-weight:600}
    article.page h3{font-size:1.15rem;line-height:1.3;margin:1.6rem 0 .5rem;font-weight:600}
    article.page p{margin-bottom:1.05rem}
    article.page ul,article.page ol{padding-left:1.5rem;margin-bottom:1.05rem}
    article.page li{margin-bottom:.35rem}
    article.page a{color:var(--accent)}
    article.page.cover{min-height:calc(100vh - 9rem)}
    article.page.cover.active{display:flex;flex-direction:column;justify-content:center;text-align:center}
    article.page.cover h1{font-size:2.7rem;margin:0 0 .6rem}
    .cover-sub{font-size:1.15rem;color:var(--text-2);font-style:italic;margin-bottom:.3rem}
    .cover-date{font-size:.95rem;color:var(--text-3)}
    article.page blockquote{border-left:3px solid var(--accent);background:var(--quote-bg);padding:.7rem 1.1rem;margin:1.3rem 0;color:var(--text-2);font-style:italic;border-radius:0 var(--radius) var(--radius) 0}
    article.page blockquote p:last-child{margin-bottom:0}
    article.page code{font-family:ui-monospace,'Courier New',Consolas,monospace;font-size:.85em;background:var(--bg-card);padding:.15em .4em;border-radius:3px}
    article.page pre{background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:1rem 1.2rem;overflow-x:auto;margin-bottom:1.25rem;line-height:1.5;font-size:14px}
    article.page pre>code{background:none;padding:0;font-size:.95em}
    article.page pre:has(>code.language-mermaid){border-style:dashed}
    article.page pre:has(>code.language-mermaid)::before{content:"⬡ Diagrama Mermaid — renderização disponível em versão futura";display:block;font-family:var(--font-ui);font-size:11.5px;font-weight:600;color:var(--text-3);background:var(--bg-side);margin:-1rem -1.2rem .8rem;padding:.4rem .8rem;border-bottom:1px solid var(--border);border-radius:6px 6px 0 0}
    .table-wrap{overflow-x:auto;margin-bottom:1.25rem;border-radius:var(--radius)}
    article.page table{border-collapse:collapse;width:100%;font-size:15px;font-family:var(--font-ui)}
    article.page th,article.page td{border:1px solid var(--border);padding:.5rem .75rem;text-align:left}
    article.page th{background:var(--bg-card);font-weight:600;font-size:13px}
    .reading-table--sticky thead th{position:sticky;top:0;z-index:1}
    article.page img{max-width:100%;height:auto;border-radius:4px;margin:.5rem 0 1rem}
    .img-placeholder{background:#fef3cd;border:1px solid #f0c040;padding:.5rem 1rem;border-radius:4px;font-size:.85em;margin:.5rem 0 1rem;font-family:var(--font-ui);color:#1a1a1a}
    [data-theme="dark"] .img-placeholder{background:#3d3520;border-color:#8a7020;color:var(--text)}
    article.page .katex-display{overflow-x:auto;overflow-y:hidden;padding:.3rem 0}
    #nav-bar{position:fixed;bottom:0;left:210px;right:0;display:flex;align-items:center;justify-content:center;gap:1rem;padding:.6rem 1rem;background:var(--bg);border-top:1px solid var(--border-light);font-family:var(--font-ui);z-index:10}
    #nav-bar button{min-width:44px;min-height:44px;padding:.5rem 1.1rem;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg);color:var(--text-2);font-size:13.5px;font-weight:500;cursor:pointer}
    #nav-bar button:hover:not(:disabled){background:var(--bg-hover);color:var(--text)}
    #nav-bar button:disabled{opacity:.35;cursor:not-allowed}
    #page-counter{font-size:13px;color:var(--text-3);min-width:8rem;text-align:center}
    @media (max-width:768px){
      #toc{display:none}
      .toc-select{display:block;position:sticky;top:0;z-index:5;width:100%;font-family:var(--font-ui);font-size:13px;padding:.7rem .9rem;border:0;border-bottom:1px solid var(--border);background:var(--bg-side);color:var(--text)}
      #nav-bar{left:0}
      article.page{font-size:17px;padding:1.6rem 1rem}
      article.page h1{font-size:1.8rem}
      article.page.cover h1{font-size:2.1rem}
    }
    @media print{#toc,#nav-bar,.toc-select{display:none!important}article.page{display:block!important;page-break-after:always}body{overflow:visible}}
  `;
}

/** Script no <head>: tema inicial por prefers-color-scheme se o app não mandar. */
function buildHeadScript(): string {
  return `(function(){try{var d=document.documentElement;if(!d.getAttribute('data-theme')){var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;d.setAttribute('data-theme',m?'dark':'light');}}catch(_){}})();`;
}

function buildNavScript(): string {
  return `
(function(){
  var pages = document.querySelectorAll('.page');
  var links = document.querySelectorAll('#toc a');
  var select = document.getElementById('toc-select');
  var reader = document.getElementById('reader');
  var total = pages.length;
  var current = 0;

  function setActive(idx){
    links.forEach(function(a,i){ a.classList.toggle('active', i===idx); });
    if (select) select.value = String(idx);
  }

  function show(n){
    if (pages[current]) pages[current].classList.remove('active');
    current = Math.max(0, Math.min(n, total-1));
    if (pages[current]) pages[current].classList.add('active');
    var counter = document.getElementById('page-counter');
    if (counter) counter.textContent = 'Página ' + (current+1) + ' de ' + total;
    var prev = document.getElementById('btn-prev');
    var next = document.getElementById('btn-next');
    if (prev) prev.disabled = current===0;
    if (next) next.disabled = current===total-1;
    if (reader) reader.scrollTop = 0;
    try {
      var el = pages[current];
      var idx = el && el.dataset.page != null ? Number(el.dataset.page) : current;
      window.parent.postMessage({ type:'zetel:page-change', pageIndex: idx }, '*');
    } catch(_){}
  }

  // Destaque da seção ativa derivado da página visível (uma por vez) via IO.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (e.isIntersecting) {
          var i = Number(e.target.getAttribute('data-nav'));
          if (!isNaN(i)) setActive(i);
        }
      });
    }, { root: reader, threshold: 0.1 });
    pages.forEach(function(p){ io.observe(p); });
  }

  var prevBtn = document.getElementById('btn-prev');
  var nextBtn = document.getElementById('btn-next');
  if (prevBtn) prevBtn.addEventListener('click', function(){ show(current-1); });
  if (nextBtn) nextBtn.addEventListener('click', function(){ show(current+1); });
  links.forEach(function(a,i){ a.addEventListener('click', function(e){ e.preventDefault(); show(i); }); });
  if (select) select.addEventListener('change', function(){ show(Number(select.value)); });

  // Tema vindo do app por postMessage (Regra #2: o app NÃO injeta CSS, só o tema).
  window.addEventListener('message', function(e){
    var d = e && e.data;
    if (d && d.type === 'zetel:theme' && (d.theme === 'dark' || d.theme === 'light')) {
      document.documentElement.setAttribute('data-theme', d.theme);
    }
  });

  setActive(0);
  show(0);
})();
`.trim();
}

async function assembleHtml(
  displayName: string,
  builtAt: string,
  toc: TocEntry[],
  pageHtmlParts: string[],
  coverIndex: number,
): Promise<string> {
  const total = pageHtmlParts.length;

  let buildDate: string;
  try {
    buildDate = new Date(builtAt).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    buildDate = builtAt.slice(0, 10);
  }

  const tocItems = toc
    .map(
      (e, i) =>
        `<li><a href="#${escapeHtml(e.anchor)}" data-idx="${i}">${escapeHtml(e.heading)}</a></li>`,
    )
    .join('\n');

  const selectOptions = toc
    .map((e, i) => `<option value="${i}">${escapeHtml(e.heading)}</option>`)
    .join('\n');

  const articles = pageHtmlParts
    .map((html, i) => {
      const isCover = i === coverIndex;
      const cls = isCover ? 'page cover' : 'page';
      const coverExtra = isCover
        ? `<p class="cover-sub">${escapeHtml(displayName)}</p><p class="cover-date">${escapeHtml(buildDate)}</p>`
        : '';
      return `<article id="${escapeHtml(toc[i].anchor)}" class="${cls}" data-page="${toc[i].pageIndex}" data-nav="${i}">${html}${coverExtra}</article>`;
    })
    .join('\n');

  const assetCss = loadAssetCss();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="zetel-pages" content="${total}">
  <meta name="zetel-built" content="${builtAt}">
  <title>${escapeHtml(displayName)}</title>
  <style>${assetCss}</style>
  <style>${buildViewerCss()}</style>
  <script>${buildHeadScript()}</script>
</head>
<body>
  <div id="app">
    <nav id="toc">
      <p class="idx-title">Conteúdo</p>
      <ul>${tocItems}</ul>
    </nav>
    <main id="reader">
      <select id="toc-select" class="toc-select" aria-label="Ir para a página">${selectOptions}</select>
      ${articles}
    </main>
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
 * Determinístico: mesmo input → mesmo arquivo, exceto `zetel-built` (Regra #1: sem LLM).
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
  // Deve espelhar EXATAMENTE o parser de processZetel (lib/ingestao-service.ts):
  // remark-math entra na segmentação, senão a paridade anchor/content_hash quebra.
  const parser = remark().use(remarkGfm).use(remarkMath);
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

  // Dívida HTML-1: primeira página só com um heading isolado vira capa.
  const first = segmented[0];
  const coverIndex =
    first && first.nodes.length === 1 && first.nodes[0].type === 'heading' ? 0 : -1;

  const pageHtmlParts: string[] = [];
  for (const page of segmented) {
    pageHtmlParts.push(await pageNodesToHtml(page.nodes, imageMap));
  }

  const html = await assembleHtml(zetel.displayName, builtAt, toc, pageHtmlParts, coverIndex);

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
