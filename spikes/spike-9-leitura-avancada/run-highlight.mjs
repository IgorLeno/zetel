#!/usr/bin/env node
/**
 * Spike 9.1 — highlight.js (rehype-highlight)
 *
 * Mede:
 *  - viabilidade no pipeline do app com subset de linguagens
 *  - sobrevivência ao sanitize ATUAL do app (sem estender schema)
 *  - tamanho do CSS de tema (claro + escuro) embutido inline
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import rehypeHighlight from 'rehype-highlight';
// Grammars do subset mínimo (lowlight aceita o registro highlight.js/lib/languages/*).
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';

import { renderMarkdown, sizeKB } from './lib-pipeline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const inputPath = join(__dirname, 'input.md');
const outDir = join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });

const md = readFileSync(inputPath, 'utf8');

// ── highlight.js restrito ao subset (sem auto-detect global) ────────────────────
const languages = { javascript, typescript, python, bash, json, sql, rust };
const htmlBody = await renderMarkdown(md, {
  rehypePlugins: [[rehypeHighlight, { languages, detect: false }]],
  // schema padrão = appSanitizeSchema. span + className já são permitidos no app.
});

const hljsSurvives = /class="[^"]*hljs/.test(htmlBody);
const tokenSpansPresent = /class="[^"]*hljs-(keyword|string|function|number|title)/.test(htmlBody);

// ── CSS de tema: claro + escuro, ambos do pacote highlight.js (sem CDN) ──────────
const lightCss = readFileSync(require.resolve('highlight.js/styles/github.css'), 'utf8');
const darkRaw = readFileSync(require.resolve('highlight.js/styles/github-dark.css'), 'utf8');

// Escopar o tema escuro sob [data-theme="dark"] para coexistir com o claro.
// Comentários permanecem intactos; só seletores reais recebem o prefixo.
const DARK_SCOPE = '[data-theme="dark"]';

function scopeDarkSelectors(css) {
  const commentRe = /\/\*[\s\S]*?\*\//g;
  let out = '';
  let last = 0;
  let m;
  while ((m = commentRe.exec(css)) !== null) {
    out += scopeDarkChunk(css.slice(last, m.index));
    out += m[0];
    last = m.index + m[0].length;
  }
  out += scopeDarkChunk(css.slice(last));
  return out;
}

function scopeDarkChunk(chunk) {
  return chunk.replace(/(?:^|})\s*([^{}@][^{}]*?)\s*\{/g, (match, sel) => {
    const brace = match.startsWith('}') ? '}' : '';
    const scoped = sel
      .split(',')
      .map((s) => `${DARK_SCOPE} ${s.trim()}`)
      .join(', ');
    return `${brace}\n${scoped} {`;
  });
}

const darkScoped = scopeDarkSelectors(darkRaw);

const themeCss = `/* light */\n${lightCss}\n/* dark (escopado) */\n${darkScoped}`;

const doc = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Spike highlight.js</title>
<style>${themeCss}</style>
<style>
  body{font-family:Georgia,serif;max-width:65ch;margin:2rem auto;padding:0 1rem;line-height:1.7;background:#fafaf8;color:#1a1a1a}
  pre{background:#f4f4f1;border:1px solid #e3e3df;border-radius:5px;padding:1rem 1.25rem;overflow-x:auto}
  pre code{font-family:'Courier New',monospace;font-size:.85em}
</style>
</head><body>
<p style="font:13px sans-serif;color:#888">Tema claro (padrão). Adicione data-theme="dark" no &lt;html&gt; para o escuro.</p>
${htmlBody}
</body></html>`;

writeFileSync(join(outDir, 'result-highlight.html'), doc, 'utf8');

console.log('═══ highlight.js ═══');
console.log('Subset registrado: javascript, typescript, python, bash, json, sql, rust');
console.log('Sobrevive ao sanitize do APP (sem estender)?', hljsSurvives ? 'sim' : 'NÃO');
console.log('Spans de token (hljs-keyword/string/...)?   ', tokenSpansPresent ? 'sim' : 'não');
console.log('CSS tema claro (github.css)         ', sizeKB(lightCss), 'KB');
console.log('CSS tema escuro (github-dark, escop.)', sizeKB(darkScoped), 'KB');
console.log('CSS total (claro + escuro)          ', sizeKB(themeCss), 'KB');
console.log('Documento final                     ', sizeKB(doc), 'KB');
console.log('\noutput/result-highlight.html escrito.');
