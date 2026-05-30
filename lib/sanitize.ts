import { defaultSchema } from 'hast-util-sanitize';
import type { Schema } from 'hast-util-sanitize';

/**
 * Subset MathML que o KaTeX emite no modo `htmlAndMathml` (D18). Lista validada
 * no Spike 9.1 (`run-katex.mjs`, const `mathmlTags`); sem ela o sanitize remove
 * `<math>`/`<mrow>`/… e as equações somem silenciosamente. `annotation-xml` é
 * incluído por completude do subset MathML de apresentação (PRD §9).
 */
const mathmlTags = [
  'math', 'semantics', 'annotation', 'annotation-xml',
  'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'munder', 'mover',
  'munderover', 'mtable', 'mtr', 'mtd', 'mspace', 'mpadded', 'mphantom',
  'mstyle', 'menclose', 'merror',
];

/**
 * Atributos de apresentação MathML usados pelo KaTeX e por leitores acessíveis.
 * Liberados apenas nas tags MathML (não em `*`) para manter o sanitize cirúrgico
 * (Restrição #4 da Etapa 9.2): nada além do necessário ao KaTeX.
 */
const mathmlAttrKeys = [
  'mathvariant', 'stretchy', 'fence', 'displaystyle', 'scriptlevel',
  'lspace', 'rspace', 'accent', 'largeop', 'movablelimits', 'symmetric',
  'maxsize', 'minsize', 'linethickness', 'bevelled', 'notation',
];

/**
 * Schema de sanitização para o HTML de leitura (Spike A / Módulo 4, estendido
 * no Módulo 9 para KaTeX). Remove `id` do clobber para que `rehype-slug`
 * preserve slugs nos headings. O subset MathML + `style`/`ariaHidden` é
 * exigido pelo KaTeX (Spike 9.1); `rehype-highlight` não precisa de extensão
 * (emite `<span class="hljs-*">`, já coberto por `*`/className).
 *
 * `style` NÃO entra em `*` (seria XSS se HTML cru vazasse): só em `span`/`mstyle`,
 * tags cujo conteúdo o KaTeX controla — o pipeline não admite HTML cru
 * (`allowDangerousHtml: false`), então não há span de origem do usuário.
 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobber: (defaultSchema.clobber ?? []).filter((a) => a !== 'id'),
  tagNames: [...(defaultSchema.tagNames ?? []), ...mathmlTags],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'id', 'ariaHidden'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'className'],
    span: ['className', 'style', 'ariaHidden'],
    // ariaHidden em camelCase — hast-util-sanitize ignora 'aria-hidden'.
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
  },
};
