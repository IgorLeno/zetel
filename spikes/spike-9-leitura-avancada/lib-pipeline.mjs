/**
 * Pipeline base do app, espelhando lib/render-service.ts:67-107.
 *
 *   remark-parse → remark-gfm → remark-rehype{allowDangerousHtml:false}
 *   → rehype-slug → sanitize(hast, schema) → toHtml
 *
 * Os scripts do spike adicionam plugins (remark-math/rehype-katex,
 * rehype-highlight) entre essas etapas para medir o impacto sobre o
 * pipeline real — não sobre um pipeline inventado.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import { sanitize, defaultSchema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';

/**
 * Schema de sanitização do app (cópia de lib/sanitize.ts).
 * Estende defaultSchema permitindo className/id em '*'. NÃO conhece
 * MathML — por isso quebra KaTeX (ver run-katex.mjs).
 */
export const appSanitizeSchema = {
  ...defaultSchema,
  clobber: (defaultSchema.clobber ?? []).filter((a) => a !== 'id'),
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'id'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'className'],
  },
};

/**
 * Converte markdown → HTML usando o pipeline base + plugins extras.
 *
 * @param {string} md            markdown de entrada
 * @param {object} opts
 * @param {Array}  opts.remarkPlugins  plugins remark (mdast) extras, ex [[remarkMath]]
 * @param {Array}  opts.rehypePlugins  plugins rehype (hast) extras, ex [[rehypeKatex]]
 * @param {object} opts.schema         schema de sanitize (default: appSanitizeSchema)
 * @returns {Promise<string>} HTML sanitizado
 */
export async function renderMarkdown(md, opts = {}) {
  const { remarkPlugins = [], rehypePlugins = [], schema = appSanitizeSchema } = opts;

  let processor = unified().use(remarkParse).use(remarkGfm);
  for (const p of remarkPlugins) processor = processor.use(...[].concat(p));

  processor = processor.use(remarkRehype, { allowDangerousHtml: false }).use(rehypeSlug);
  for (const p of rehypePlugins) processor = processor.use(...[].concat(p));

  // Espelha o app: .run() → hast, depois sanitize, depois toHtml.
  const mdast = processor.parse(md);
  const hast = await processor.run(mdast);
  const safe = sanitize(hast, schema);
  return toHtml(safe);
}

/** Tamanho de uma string UTF-8 em KB com 2 casas. */
export function sizeKB(str) {
  return (Buffer.byteLength(str, 'utf8') / 1024).toFixed(2);
}
