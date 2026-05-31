import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join } from 'node:path';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
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
import postcss, { type Rule } from 'postcss';
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
  parseMarkdownForSegmentation,
  segmentFile,
  type SegmentedPage,
} from './ingestao-service';
import { getZetelById, slugify } from './zetel-service';
import { sanitizeSchema } from './sanitize';
import {
  GUIA_ESTUDO_FILENAME,
  GUIA_ESTUDO_META_FILENAME,
  GUIA_ESTUDO_SOURCE_FILENAME,
  getStudyGuideInfo,
} from './study-guide-service';

const DEFAULT_MAX_WORDS = 1000;
const IMG_BLOCKED = '__blocked__';
const IMG_NOTFOUND = '__notfound__';
const LEITURA_TECNICA_FILENAME = 'leitura-tecnica.html';
const LEITURA_LEGADO_FILENAME = 'leitura.html';

export type LeituraArtifactMode = 'tecnico' | 'legado';

export interface ResolvedLeituraArtifact {
  kind: 'documento-tecnico';
  mode: LeituraArtifactMode;
  filename: string;
  path: string;
}

interface ArtifactSummary {
  exists: boolean;
  mode: LeituraArtifactMode | null;
  filename: string;
  sizeBytes: number | null;
  lastBuiltAt: string | null;
  pagesCount: number;
}

interface StudyGuideArtifactSummary {
  exists: boolean;
  filename: typeof GUIA_ESTUDO_FILENAME;
  metaExists: boolean;
  metaFilename: typeof GUIA_ESTUDO_META_FILENAME;
  sourceExists: boolean;
  sourceFilename: typeof GUIA_ESTUDO_SOURCE_FILENAME;
  model: string | null;
  generatedAt: string | null;
  counts: { cards: number; secoes: number; glossario: number; quiz: number; zettelkasten: number } | null;
}

export interface ArtifactsInfo {
  mode: LeituraArtifactMode | null;
  openArtifact: Omit<ResolvedLeituraArtifact, 'path'> | null;
  leituraHtml: ArtifactSummary;
  documentoTecnico: ArtifactSummary;
  guiaEstudo: StudyGuideArtifactSummary;
}

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
  const root = postcss.parse(css);
  root.walkRules((rule: Rule) => {
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'keyframes') return;
    rule.selectors = rule.selectors.map((sel: string) => `${scope} ${sel.trim()}`);
  });
  return root.toString();
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

function isElement(node: unknown, tagName?: string): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: unknown }).type === 'element' &&
    (tagName === undefined || (node as Element).tagName === tagName)
  );
}

function element(
  tagName: string,
  className: string[],
  children: HastContent[],
  properties: Element['properties'] = {},
): Element {
  return {
    type: 'element',
    tagName,
    properties: { ...properties, className },
    children: children as Element['children'],
  };
}

function countTr(node: HastContent): number {
  let n = 0;
  visit({ type: 'root', children: [node] } as HastRoot, 'element', (el: Element) => {
    if (el.tagName === 'tr') n++;
  });
  return n;
}

type SegmentedNode = SegmentedPage['nodes'][number];

function mdastPlainText(node: SegmentedNode): string {
  const n = node as { value?: unknown; children?: SegmentedNode[] };
  if (typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(mdastPlainText).join('');
  return '';
}

function isWhitespaceOnlyMdastNode(node: SegmentedNode): boolean {
  return mdastPlainText(node).trim().length === 0;
}

function wrapH3RunsInSubcards(children: HastContent[]): HastContent[] {
  const out: HastContent[] = [];
  const run: HastContent[][] = [];
  let currentBlock: HastContent[] | null = null;

  const flush = () => {
    if (currentBlock) {
      run.push(currentBlock);
      currentBlock = null;
    }

    if (run.length >= 2) {
      out.push(
        element(
          'div',
          ['subcard-grid'],
          run.map((block) => element('div', ['subcard'], block)),
        ),
      );
    } else if (run.length === 1) {
      out.push(...run[0]);
    }

    run.length = 0;
  };

  for (const child of children) {
    if (isElement(child, 'h3')) {
      if (currentBlock) run.push(currentBlock);
      currentBlock = [child];
      continue;
    }

    if (currentBlock) {
      currentBlock.push(child);
      continue;
    }

    flush();
    out.push(child);
  }

  flush();
  return out;
}

function wrapH2SectionsInCards(children: HastContent[]): HastContent[] {
  const cards: HastContent[] = [];
  let currentCard: HastContent[] = [];

  const flush = () => {
    if (currentCard.length === 0) return;
    cards.push(element('div', ['section-card'], wrapH3RunsInSubcards(currentCard)));
    currentCard = [];
  };

  for (const child of children) {
    if (isElement(child, 'h2')) {
      flush();
      currentCard.push(child);
      continue;
    }

    currentCard.push(child);
  }

  flush();
  return cards;
}

function codeLanguage(node: Element): string | null {
  for (const cls of classNames(node)) {
    if (!cls.startsWith('language-')) continue;
    const lang = cls.slice('language-'.length);
    return lang in HLJS_LANGUAGES ? lang : null;
  }
  return null;
}

/** Converte nós MDAST de uma página em HTML sanitizado (KaTeX + highlight.js). */
async function pageNodesToHtml(
  nodes: SegmentedPage['nodes'],
  imageMap: Record<string, string>,
  isCover: boolean,
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

  // Código: label real de linguagem preservado pelo sanitize (sem data-*).
  visit(hast, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'pre' || !parent || typeof index !== 'number') return;
    if (isElement(parent, 'div') && classNames(parent).includes('code-block')) return;

    const code = node.children.find((child) => isElement(child, 'code'));
    if (!isElement(code, 'code')) return;

    const lang = codeLanguage(code);
    if (!lang || lang === 'mermaid') return;

    (parent as Parent).children[index] = element('div', ['code-block'], [
      element('span', ['code-lang'], [{ type: 'text', value: lang }]),
      node,
    ]);
  });

  if (!isCover) {
    hast.children = wrapH2SectionsInCards(hast.children);
  }

  const safe = sanitize(hast, sanitizeSchema) as HastRoot;
  return toHtml(safe);
}

// ---------------------------------------------------------------------------
// Template (CSS + scripts) — tudo inline, sem CDN (Restrição #1)
// ---------------------------------------------------------------------------

/** Vars do tema escuro, reusadas em :root e [data-theme="dark"]. */
const DARK_VARS = `
  --bg-page:#0d1117; --bg-card:#161b22; --bg-subcard:#21262d;
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.14);
  --text:#e6edf3; --text-secondary:#8b949e; --text-muted:#6e7681;
  --accent:#58a6ff; --accent-soft:rgba(88,166,255,.15); --accent-hover:rgba(88,166,255,.10);
  --code-bg:#161b22; --quote-bg:rgba(88,166,255,.08); --math-bg:rgba(88,166,255,.07);
  --math-border:rgba(88,166,255,.22); --table-zebra:rgba(255,255,255,.035);
  --cover-mark-bg:#58a6ff; --cover-mark-fg:#0d1117;
  --warning-bg:#3d3520; --warning-border:#8a7020;`;

/** Vars do tema claro, aplicadas via [data-theme="light"] e fallback prefers. */
const LIGHT_VARS = `
  --bg-page:#ffffff; --bg-card:#f6f8fa; --bg-subcard:#eaeef2;
  --border:rgba(31,35,40,.12); --border-strong:rgba(31,35,40,.18);
  --text:#1f2328; --text-secondary:#57606a; --text-muted:#6e7781;
  --accent:#0969da; --accent-soft:rgba(9,105,218,.15); --accent-hover:rgba(9,105,218,.10);
  --code-bg:#f6f8fa; --quote-bg:rgba(9,105,218,.07); --math-bg:rgba(9,105,218,.055);
  --math-border:rgba(9,105,218,.20); --table-zebra:rgba(31,35,40,.035);
  --cover-mark-bg:#0969da; --cover-mark-fg:#ffffff;
  --warning-bg:#fff8c5; --warning-border:#d4a72c;`;

function buildViewerCss(): string {
  return `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      ${DARK_VARS}
      --font-ui:system-ui,-apple-system,'Segoe UI',sans-serif;
      --font-code:'JetBrains Mono','Fira Code','Cascadia Code',monospace;
      --radius-card:8px; --radius-subcard:6px;
    }
    [data-theme="dark"]{${DARK_VARS}}
    [data-theme="light"]{${LIGHT_VARS}}
    @media (prefers-color-scheme:light){:root:not([data-theme]){${LIGHT_VARS}}}
    html,body{height:100%}
    body{display:flex;flex-direction:column;font-family:var(--font-ui);font-size:15px;color:var(--text);background:var(--bg-page);line-height:1.6;overflow:hidden}
    #app{display:flex;flex:1;min-height:0;overflow:hidden}
    #toc{width:220px;min-width:220px;flex-shrink:0;padding:18px 14px;overflow-y:auto;background:var(--bg-card);border-right:1px solid var(--border);font-size:13px}
    #toc .idx-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px}
    #toc ul{max-height:calc(100vh - 70px);overflow-y:auto;list-style:none;padding-right:2px}
    #toc a{display:block;padding:7px 10px;border:1px solid transparent;border-radius:6px;color:var(--text-secondary);text-decoration:none;line-height:1.35;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #toc a:hover{background:var(--bg-subcard);border-color:var(--border);color:var(--text)}
    #toc a.active{background:var(--accent-soft);border-color:var(--math-border);color:var(--accent);font-weight:650}
    .toc-select{display:none;font:inherit}
    #reader{flex:1;overflow-y:auto;min-height:0;padding-bottom:5rem}
    article.page{display:none;width:min(860px,calc(100% - 48px));max-width:860px;margin-inline:auto;padding:34px 0 44px;color:var(--text);text-wrap:pretty}
    article.page.active{display:block}
    article.page h1,article.page h2,article.page h3{font-family:var(--font-ui);text-wrap:pretty}
    article.page h1{font-size:30px;line-height:1.12;margin:0 0 20px;font-weight:750;color:var(--accent)}
    article.page h2{font-size:21px;line-height:1.28;margin:0 0 18px;font-weight:700;color:var(--accent)}
    article.page h3{font-size:14px;line-height:1.35;margin:24px 0 9px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary)}
    article.page p{margin-bottom:15px;line-height:1.72}
    article.page ul,article.page ol{padding-left:24px;margin-bottom:15px}
    article.page li{margin-bottom:7px;padding-left:2px}
    article.page li>ul,article.page li>ol{margin-top:7px;margin-bottom:8px;padding-left:24px}
    article.page a{color:var(--accent)}
    article.page.cover{min-height:calc(100vh - 76px);width:100%;max-width:none;padding:0 24px;background:linear-gradient(180deg,var(--bg-card),var(--bg-page))}
    article.page.cover.active{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
    article.page.cover h1{font-size:42px;line-height:1.08;max-width:900px;margin:0 0 18px;font-weight:780;color:var(--text)}
    .cover-brand{display:inline-flex;align-items:center;gap:10px;margin-bottom:28px;color:var(--text-secondary);font-family:var(--font-ui);font-size:13px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
    .cover-mark{display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:8px;background:var(--cover-mark-bg);color:var(--cover-mark-fg);box-shadow:0 8px 24px rgba(0,0,0,.16)}
    .cover-mark svg{width:19px;height:19px;stroke:currentColor}
    .cover-sub{font-size:17px;color:var(--text-secondary);margin-bottom:18px}
    .cover-meta{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--bg-page);color:var(--text-secondary);font-size:13px}
    .cover-meta strong{color:var(--text);font-weight:650}
    .section-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-card);padding:24px;margin-bottom:18px}
    .section-card>:last-child,.subcard>:last-child{margin-bottom:0}
    .subcard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:18px 0}
    .subcard{background:var(--bg-subcard);border:1px solid var(--border);border-radius:var(--radius-subcard);padding:16px}
    .subcard h3{font-size:12px;line-height:1.35;margin:0 0 8px;letter-spacing:.05em;color:var(--text-secondary)}
    article.page blockquote{border:1px solid var(--border);border-left:4px solid var(--accent);background:var(--quote-bg);padding:14px 18px;margin:20px 0;color:var(--text-secondary);font-style:italic;border-radius:0 var(--radius-subcard) var(--radius-subcard) 0}
    article.page blockquote p:last-child{margin-bottom:0}
    article.page code{font-family:var(--font-code);font-size:.86em;background:var(--bg-subcard);border:1px solid var(--border);padding:.12em .38em;border-radius:4px}
    .code-block{position:relative;background:var(--code-bg);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px;margin:18px 0}
    .code-lang{position:absolute;top:10px;right:12px;font-family:var(--font-ui);font-size:12px;line-height:1;color:var(--text-secondary)}
    article.page pre{background:var(--code-bg);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px;overflow-x:auto;margin:18px 0;line-height:1.55;font-size:13px;font-family:var(--font-code)}
    .code-block pre{border:0;border-radius:0;padding:0;margin:0;background:transparent}
    article.page pre>code{background:none;padding:0;font-size:13px;font-family:var(--font-code)}
    article.page pre:has(>code.language-mermaid){border-style:dashed}
    article.page pre:has(>code.language-mermaid)::before{content:"⬡ Diagrama Mermaid — renderização disponível em versão futura";display:block;font-family:var(--font-ui);font-size:11.5px;font-weight:600;color:var(--text-muted);background:var(--bg-subcard);margin:-16px -16px 12px;padding:8px 12px;border-bottom:1px solid var(--border);border-radius:var(--radius-card) var(--radius-card) 0 0}
    .table-wrap{overflow:hidden;overflow-x:auto;margin:20px 0;border:1px solid var(--border);border-radius:var(--radius-card);background:var(--bg-page)}
    article.page table{border-collapse:collapse;width:100%;font-size:14px;font-family:var(--font-ui)}
    article.page th,article.page td{border:1px solid var(--border);padding:10px 14px;text-align:left}
    article.page th{background:var(--bg-subcard);font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--text)}
    article.page tbody tr:nth-child(even){background:var(--table-zebra)}
    .reading-table--sticky thead th{position:sticky;top:0;z-index:1}
    article.page img{max-width:100%;height:auto;border-radius:var(--radius-subcard);margin:8px 0 16px}
    .img-placeholder{background:var(--warning-bg);border:1px solid var(--warning-border);padding:10px 16px;border-radius:var(--radius-subcard);font-size:13px;margin:8px 0 16px;font-family:var(--font-ui);color:var(--text)}
    article.page .katex-display{overflow-x:auto;overflow-y:hidden;padding:20px 24px;background:var(--math-bg);border:1px solid var(--math-border);border-radius:var(--radius-card);text-align:center}
    article.page .katex-display>.katex{padding:2px 0}
    #nav-bar{position:fixed;bottom:0;left:220px;right:0;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 16px;background:var(--bg-page);border-top:1px solid var(--border);font-family:var(--font-ui);z-index:10}
    #nav-bar button{min-width:44px;min-height:44px;padding:8px 16px;border-radius:var(--radius-subcard);border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:14px;font-weight:550;cursor:pointer}
    #nav-bar button:hover:not(:disabled){background:var(--accent-hover);border-color:var(--accent);color:var(--accent)}
    #nav-bar button:disabled{opacity:.42;cursor:not-allowed}
    #page-counter{font-size:13px;color:var(--text-secondary);min-width:8rem;text-align:center}
    @media (max-width:768px){
      #toc{display:none}
      .toc-select{display:block;position:sticky;top:0;z-index:5;width:100%;font-family:var(--font-ui);font-size:13px;padding:12px 14px;border:0;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text)}
      #nav-bar{left:0}
      article.page{width:calc(100% - 28px);padding:20px 0 34px}
      .section-card{padding:18px}
      article.page h1{font-size:26px}
      article.page.cover h1{font-size:32px}
      .cover-brand{margin-bottom:22px}
      .cover-meta{max-width:100%;white-space:normal;justify-content:center}
      .subcard-grid{grid-template-columns:1fr}
    }
    @media print{#toc,#nav-bar,.toc-select{display:none!important}body{overflow:visible;background:#fff;color:#000}article.page{display:block!important;width:auto;max-width:none;page-break-after:always}.section-card,.subcard{border:1px solid #ddd;background:#fff}}
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
        ? `<div class="cover-brand"><span class="cover-mark" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M3 3h10L5 13h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Zetel</span></div><p class="cover-sub">${escapeHtml(displayName)}</p><p class="cover-meta"><strong>Documento Técnico</strong><span>Gerado em ${escapeHtml(buildDate)}</span></p>`
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
 * Gera `artefatos/leitura-tecnica.html` a partir de `zetel_pages` + mapa de imagens.
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
    const tree = parseMarkdownForSegmentation(content);
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
  const filteredNodes = first
    ? first.nodes.filter((node) => !isWhitespaceOnlyMdastNode(node))
    : [];
  const coverIndex =
    filteredNodes.length === 1 && filteredNodes[0].type === 'heading' ? 0 : -1;

  const pageHtmlParts: string[] = [];
  for (let i = 0; i < segmented.length; i++) {
    const page = segmented[i];
    pageHtmlParts.push(await pageNodesToHtml(page.nodes, imageMap, i === coverIndex));
  }

  const html = await assembleHtml(zetel.displayName, builtAt, toc, pageHtmlParts, coverIndex);

  const outDir = artefatosDir(vaultPath, slug);
  mkdirSync(outDir, { recursive: true });
  const outputPath = join(outDir, LEITURA_TECNICA_FILENAME);
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

/** Caminho absoluto canônico do Documento Técnico para um slug (sem verificar existência). */
export function leituraHtmlPath(vaultPath: string, slug: string): string {
  return leituraTecnicaHtmlPath(vaultPath, slug);
}

/** Caminho absoluto de `leitura-tecnica.html` para um slug (sem verificar existência). */
export function leituraTecnicaHtmlPath(vaultPath: string, slug: string): string {
  return join(artefatosDir(vaultPath, slug), LEITURA_TECNICA_FILENAME);
}

/** Caminho absoluto do `leitura.html` legado para um slug (sem verificar existência). */
export function leituraLegadoHtmlPath(vaultPath: string, slug: string): string {
  return join(artefatosDir(vaultPath, slug), LEITURA_LEGADO_FILENAME);
}

/** Resolve o HTML de leitura que deve ser aberto, priorizando o nome canônico. */
export function resolveLeituraHtmlArtifact(
  vaultPath: string,
  slug: string,
): ResolvedLeituraArtifact | null {
  const tecnicaPath = leituraTecnicaHtmlPath(vaultPath, slug);
  if (existsSync(tecnicaPath)) {
    return {
      kind: 'documento-tecnico',
      mode: 'tecnico',
      filename: LEITURA_TECNICA_FILENAME,
      path: tecnicaPath,
    };
  }

  const legadoPath = leituraLegadoHtmlPath(vaultPath, slug);
  if (existsSync(legadoPath)) {
    return {
      kind: 'documento-tecnico',
      mode: 'legado',
      filename: LEITURA_LEGADO_FILENAME,
      path: legadoPath,
    };
  }

  return null;
}

/** Metadados dos artefatos sem ler o conteúdo do HTML. */
export function getArtifactsInfo(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
): ArtifactsInfo {
  const slug = assertZetelAtivo(db, zetelId);
  const zetel = getZetelById(db, zetelId);
  const artifact = resolveLeituraHtmlArtifact(vaultPath, slug);
  const exists = artifact !== null;
  const pagesCount = (
    db.prepare('SELECT COUNT(*) AS c FROM zetel_pages WHERE zetel_id = ?').get(zetelId) as {
      c: number;
    }
  ).c;

  const documentoTecnico: ArtifactSummary = {
    exists,
    mode: artifact?.mode ?? null,
    filename: artifact?.filename ?? LEITURA_TECNICA_FILENAME,
    sizeBytes: artifact ? statSync(artifact.path).size : null,
    lastBuiltAt: zetel?.lastBuiltAt ?? null,
    pagesCount,
  };

  const guideInfo = getStudyGuideInfo(vaultPath, slug);

  return {
    mode: artifact?.mode ?? null,
    openArtifact: artifact
      ? {
          kind: artifact.kind,
          mode: artifact.mode,
          filename: artifact.filename,
        }
      : null,
    leituraHtml: documentoTecnico,
    documentoTecnico,
    guiaEstudo: {
      exists: guideInfo.exists,
      filename: GUIA_ESTUDO_FILENAME,
      metaExists: guideInfo.metaExists,
      metaFilename: GUIA_ESTUDO_META_FILENAME,
      sourceExists: guideInfo.sourceExists,
      sourceFilename: GUIA_ESTUDO_SOURCE_FILENAME,
      model: guideInfo.model,
      generatedAt: guideInfo.generatedAt,
      counts: guideInfo.counts,
    },
  };
}
