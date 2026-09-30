import katex from 'katex';

/**
 * Matemática no chat. O chat é componente do app (não artefato): a resposta da
 * LLM continua texto; só os trechos delimitados viram KaTeX. A saída da LLM é
 * potencialmente adversarial (fontes importadas), então KaTeX roda com
 * `trust: false` (sem \href, \url, \includegraphics, \html*) e limites de
 * expansão/tamanho.
 */

export type MathPart =
  | { kind: 'text'; text: string }
  | { kind: 'math'; tex: string; display: boolean; raw: string };

// Ordem importa: `$$` antes de `$`. `$` inline exige conteúdo colado nos dois
// delimitadores e não pode ser seguido de dígito (evita moeda: "R$ 10", "$5 e $10").
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g;

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) });
    const [raw, dollars, bracket, paren, inline] = match;
    const display = dollars !== undefined || bracket !== undefined;
    const tex = (dollars ?? bracket ?? paren ?? inline ?? '').trim();
    parts.push(tex ? { kind: 'math', tex, display, raw } : { kind: 'text', text: raw });
    last = index + raw.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/**
 * HTML do KaTeX, ou `null` quando o trecho não compila (o chamador mostra o
 * texto cru). Com `trust: false` o KaTeX escapa o conteúdo e não emite links,
 * scripts nem atributos arbitrários.
 */
export function renderChatMath(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxSize: 20,
      maxExpand: 200,
      output: 'htmlAndMathml',
    });
  } catch {
    return null;
  }
}
