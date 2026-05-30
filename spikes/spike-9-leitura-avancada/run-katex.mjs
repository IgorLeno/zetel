#!/usr/bin/env node
/**
 * Spike 9.1 — KaTeX (remark-math + rehype-katex)
 *
 * Mede:
 *  - viabilidade no pipeline do app
 *  - impacto no tamanho do HTML (sem KaTeX vs com KaTeX + CSS)
 *  - determinismo (sha256 de duas execuções)
 *  - se o CSS embute inline sem CDN
 *  - se o sanitize schema do app precisa ser estendido (achado central)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { defaultSchema } from 'hast-util-sanitize';

import { renderMarkdown, appSanitizeSchema, sizeKB } from './lib-pipeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const inputPath = join(__dirname, 'input.md');
const outDir = join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });

const md = readFileSync(inputPath, 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ── Schema estendido compatível com KaTeX ──────────────────────────────────────
// KaTeX emite MathML (math, semantics, mrow, mi, mo, ...) e <span> com style/
// aria-hidden. O appSanitizeSchema (defaultSchema + className/id) NÃO conhece
// essas tags nem o atributo style → as remove, quebrando a renderização.
const mathmlTags = [
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'munder', 'mover',
  'munderover', 'mtable', 'mtr', 'mtd', 'mspace', 'mpadded', 'mphantom',
  'mstyle', 'menclose', 'merror',
];
// Atributos MathML usados por KaTeX e por renderizadores acessíveis — revisar na 9.2
// antes de promover este schema a lib/sanitize.ts (decisão spike README §1).
const mathmlAttrKeys = [
  'mathvariant',
  'stretchy',
  'fence',
  'displaystyle',
  'scriptlevel',
  'lspace',
  'rspace',
  'accent',
  'largeop',
  'movablelimits',
  'symmetric',
  'maxsize',
  'minsize',
  'linethickness',
  'bevelled',
  'notation',
];
const katexSchema = {
  ...appSanitizeSchema,
  tagNames: [...(appSanitizeSchema.tagNames ?? defaultSchema.tagNames ?? []), ...mathmlTags],
  attributes: {
    ...appSanitizeSchema.attributes,
    // ariaHidden (camelCase) — não usar 'aria-hidden' (hast-util-sanitize ignora).
    // style NÃO em '*' (XSS se HTML cru escapar); só em tags que o KaTeX controla.
    '*': [...(appSanitizeSchema.attributes?.['*'] ?? []), 'ariaHidden'],
    math: ['xmlns', 'display', ...mathmlAttrKeys],
    annotation: ['encoding', ...mathmlAttrKeys],
    mrow: mathmlAttrKeys,
    mi: mathmlAttrKeys,
    mo: mathmlAttrKeys,
    mn: mathmlAttrKeys,
    msup: mathmlAttrKeys,
    msub: mathmlAttrKeys,
    msubsup: mathmlAttrKeys,
    mfrac: mathmlAttrKeys,
    mstyle: [...mathmlAttrKeys, 'style'],
    span: ['className', 'style', 'ariaHidden'],
  },
};

// ── 1. Baseline: pipeline do app SEM math (LaTeX vira texto cru) ────────────────
const htmlNoKatex = await renderMarkdown(md);

// ── 2. Com KaTeX, mas usando o sanitize ATUAL do app (evidência da quebra) ──────
const htmlKatexAppSchema = await renderMarkdown(md, {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
  schema: appSanitizeSchema,
});
const mathmlSurvivesApp = /<math|<mrow|<annotation/.test(htmlKatexAppSchema);

// ── 3. Com KaTeX e sanitize ESTENDIDO (abordagem proposta p/ 9.2) ───────────────
const renderKatex = () =>
  renderMarkdown(md, {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    schema: katexSchema,
  });
const htmlKatexBody1 = await renderKatex();
const htmlKatexBody2 = await renderKatex();

const mathmlSurvivesExt = /<math/.test(htmlKatexBody1);
const katexClassPresent = /class="[^"]*katex/.test(htmlKatexBody1);

// ── CSS do KaTeX embutido inline (sem CDN) + fontes como data: URI ───────────────
const katexCssPath = require.resolve('katex/dist/katex.min.css');
const katexFontsDir = join(dirname(katexCssPath), 'fonts');

/** Substitui url(fonts/...) por data:base64 para leitura.html autocontido. */
function inlineKatexFontUrls(css) {
  return css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (match, _quote, url) => {
    const rel = url.replace(/^fonts\//, '');
    const fontPath = join(katexFontsDir, basename(rel));
    if (!existsSync(fontPath)) return match;
    const buf = readFileSync(fontPath);
    const ext = rel.split('.').pop()?.toLowerCase() ?? '';
    const mime =
      ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';
    return `url(data:${mime};base64,${buf.toString('base64')})`;
  });
}

let katexCss = readFileSync(katexCssPath, 'utf8');
katexCss = inlineKatexFontUrls(katexCss);
const cssAutocontido =
  !/url\([^)]*fonts\//.test(katexCss) && !/url\(fonts\//.test(katexCss);
const fontsInlined = cssAutocontido;

// Documento final autocontido (CSS inline). É o que iria para leitura.html.
const buildDoc = (body, css) => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Spike KaTeX</title>
<style>${css}</style>
<style>body{font-family:Georgia,serif;max-width:65ch;margin:2rem auto;padding:0 1rem;line-height:1.7}</style>
</head><body>${body}</body></html>`;

const finalDoc1 = buildDoc(htmlKatexBody1, katexCss);
const finalDoc2 = buildDoc(htmlKatexBody2, katexCss);

writeFileSync(join(outDir, 'result-katex.html'), finalDoc1, 'utf8');

// ── Medições ────────────────────────────────────────────────────────────────────
const deterministic = sha(finalDoc1) === sha(finalDoc2);

console.log('═══ KaTeX ═══');
console.log(
  'CSS+fontes autocontidos (sem CDN)?  ',
  cssAutocontido && fontsInlined ? 'sim' : 'NÃO (fontes ou URLs relativas pendentes)',
);
console.log('katex.min.css                       ', sizeKB(katexCss), 'KB');
console.log('');
console.log('HTML body SEM KaTeX (math = texto)  ', sizeKB(htmlNoKatex), 'KB');
console.log('HTML body COM KaTeX (só corpo)      ', sizeKB(htmlKatexBody1), 'KB');
console.log('Documento final COM KaTeX + CSS     ', sizeKB(finalDoc1), 'KB');
console.log('');
console.log('MathML sobrevive ao sanitize do APP?', mathmlSurvivesApp ? 'sim' : 'NÃO (quebra)');
console.log('MathML sobrevive ao schema ESTENDIDO?', mathmlSurvivesExt ? 'sim' : 'não');
console.log('Classes .katex presentes?           ', katexClassPresent ? 'sim' : 'não');
console.log('Determinístico (sha256 x2 iguais)?  ', deterministic ? 'sim' : 'NÃO');
console.log('sha256 doc:', sha(finalDoc1).slice(0, 16), '/', sha(finalDoc2).slice(0, 16));
console.log('\noutput/result-katex.html escrito.');
