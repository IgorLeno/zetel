/**
 * Verbalização PT-BR determinística de matemática para o TTS.
 * O provedor (OpenAI TTS) lê LaTeX cru e símbolos soltos de forma imprevisível
 * (em inglês, soletrando barras ou pulando). Aqui o texto já chega falável.
 * Cobre o LaTeX comum de chat; o que não reconhece vira texto sem sintaxe.
 */

const GREEK: Record<string, string> = {
  alpha: 'alfa', beta: 'beta', gamma: 'gama', delta: 'delta', epsilon: 'épsilon',
  varepsilon: 'épsilon', zeta: 'zeta', eta: 'eta', theta: 'teta', vartheta: 'teta',
  iota: 'iota', kappa: 'capa', lambda: 'lambda', mu: 'mi', nu: 'ni', xi: 'csi',
  pi: 'pi', rho: 'rô', sigma: 'sigma', tau: 'tau', upsilon: 'ípsilon', phi: 'fi',
  varphi: 'fi', chi: 'qui', psi: 'psi', omega: 'ômega',
  Gamma: 'gama maiúsculo', Delta: 'delta maiúsculo', Theta: 'teta maiúsculo',
  Lambda: 'lambda maiúsculo', Xi: 'csi maiúsculo', Pi: 'pi maiúsculo',
  Sigma: 'sigma maiúsculo', Phi: 'fi maiúsculo', Psi: 'psi maiúsculo',
  Omega: 'ômega maiúsculo',
};

const COMMANDS: Record<string, string> = {
  ...GREEK,
  infty: 'infinito', approx: 'aproximadamente', neq: 'diferente de', ne: 'diferente de',
  leq: 'menor ou igual a', le: 'menor ou igual a', geq: 'maior ou igual a', ge: 'maior ou igual a',
  ll: 'muito menor que', gg: 'muito maior que', equiv: 'equivale a', sim: 'da ordem de',
  propto: 'proporcional a', pm: 'mais ou menos', mp: 'menos ou mais',
  cdot: 'vezes', times: 'vezes', div: 'dividido por',
  to: 'tende a', rightarrow: 'vai para', leftarrow: 'vem de',
  Rightarrow: 'implica', implies: 'implica', Leftrightarrow: 'se e somente se', iff: 'se e somente se',
  in: 'pertence a', notin: 'não pertence a', subset: 'contido em', subseteq: 'contido ou igual a',
  cup: 'união', cap: 'interseção', emptyset: 'conjunto vazio', forall: 'para todo', exists: 'existe',
  partial: 'derivada parcial de', nabla: 'nabla', hbar: 'h cortado', ell: 'éle',
  int: 'integral', iint: 'integral dupla', iiint: 'integral tripla', oint: 'integral fechada',
  sum: 'somatório', prod: 'produtório', lim: 'limite',
  sin: 'seno', cos: 'cosseno', tan: 'tangente', log: 'log', ln: 'logaritmo natural', exp: 'exponencial',
  det: 'determinante', max: 'máximo', min: 'mínimo',
  dots: 'reticências', ldots: 'reticências', cdots: 'reticências',
  langle: '', rangle: '', left: '', right: '', big: '', Big: '', displaystyle: '',
  quad: ' ', qquad: ' ',
};

const UNICODE: Record<string, string> = {
  '∫': 'integral', '∬': 'integral dupla', '∮': 'integral fechada', '∑': 'somatório',
  '∏': 'produtório', '√': 'raiz de', '∞': 'infinito', '≈': 'aproximadamente',
  '≠': 'diferente de', '≤': 'menor ou igual a', '≥': 'maior ou igual a', '≡': 'equivale a',
  '∝': 'proporcional a', '±': 'mais ou menos', '×': 'vezes', '·': 'vezes', '÷': 'dividido por',
  '→': 'vai para', '⇒': 'implica', '⇔': 'se e somente se', '∈': 'pertence a',
  '∉': 'não pertence a', '∀': 'para todo', '∃': 'existe', '∂': 'derivada parcial de',
  '∇': 'nabla', 'ℏ': 'h cortado', '∅': 'conjunto vazio', '∪': 'união', '∩': 'interseção',
  '²': ' ao quadrado', '³': ' ao cubo',
  'α': 'alfa', 'β': 'beta', 'γ': 'gama', 'δ': 'delta', 'ε': 'épsilon', 'ζ': 'zeta',
  'η': 'eta', 'θ': 'teta', 'ι': 'iota', 'κ': 'capa', 'λ': 'lambda', 'μ': 'mi', 'ν': 'ni',
  'ξ': 'csi', 'π': 'pi', 'ρ': 'rô', 'σ': 'sigma', 'τ': 'tau', 'υ': 'ípsilon', 'φ': 'fi',
  'χ': 'qui', 'ψ': 'psi', 'ω': 'ômega',
  'Γ': 'gama maiúsculo', 'Δ': 'delta maiúsculo', 'Θ': 'teta maiúsculo', 'Λ': 'lambda maiúsculo',
  'Π': 'pi maiúsculo', 'Σ': 'sigma maiúsculo', 'Φ': 'fi maiúsculo', 'Ψ': 'psi maiúsculo',
  'Ω': 'ômega maiúsculo',
};

const UNICODE_RE = new RegExp(`[${Object.keys(UNICODE).join('')}]`, 'g');

/** Grupo `{…}` sem chaves aninhadas, ou um token simples (comando ou caractere). */
const ARG = String.raw`(\{[^{}]*\}|\\[a-zA-Z]+|[^\s{}\\])`;

function unbrace(arg: string): string {
  return arg.startsWith('{') ? arg.slice(1, -1) : arg;
}

function power(exp: string): string {
  const e = exp.trim();
  if (e === '2') return ' ao quadrado ';
  if (e === '3') return ' ao cubo ';
  if (e === "'" || e === '\\prime') return ' linha ';
  return ` elevado a ${e} `;
}

/** Aplica `fn` até o texto parar de mudar (resolve aninhamento de dentro para fora). */
function untilStable(text: string, fn: (s: string) => string): string {
  let prev: string;
  let out = text;
  let guard = 0;
  do {
    prev = out;
    out = fn(out);
  } while (out !== prev && ++guard < 20);
  return out;
}

/** Converte o conteúdo de um trecho LaTeX (sem delimitadores) em fala PT-BR. */
export function verbalizeLatex(latex: string): string {
  let s = ` ${latex} `;
  // Quebra de linha `\\` antes dos comandos: `\\x` não é o comando `\x`.
  s = s.replace(/\\\\/g, ' ');
  s = s.replace(/\\[,;:!]|~/g, ' ');
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|mathcal|operatorname|vec|hat|bar)\s*\{([^{}]*)\}/g, ' $1 ');

  s = untilStable(s, (t) => t
    .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 sobre $2 ')
    .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, ' raiz $1 de $2 ')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, ' raiz de $1 '));

  // Operadores com limites: \int_a^b, \sum_{i=1}^{n}, \lim_{x\to 0}.
  s = s.replace(new RegExp(String.raw`\\(i{1,3}nt|oint|sum|prod)\s*(?:_${ARG})?\s*(?:\^${ARG})?`, 'g'),
    (_m, op: string, lo?: string, hi?: string) => {
      const name = COMMANDS[op] ?? op;
      if (lo && hi) return ` ${name} de ${unbrace(lo)} até ${unbrace(hi)} de `;
      if (lo) return ` ${name} em ${unbrace(lo)} de `;
      return ` ${name} de `;
    });
  s = s.replace(new RegExp(String.raw`\\lim\s*_${ARG}`, 'g'), (_m, lo: string) => ` limite quando ${unbrace(lo)} de `);

  s = untilStable(s, (t) => t
    .replace(new RegExp(String.raw`\^${ARG}`, 'g'), (_m, e: string) => power(unbrace(e)))
    .replace(new RegExp(String.raw`_${ARG}`, 'g'), (_m, sub: string) => ` ${unbrace(sub)} `));

  s = s.replace(/\\([a-zA-Z]+)/g, (_m, cmd: string) => ` ${COMMANDS[cmd] ?? cmd} `);
  s = s.replace(/'/g, ' linha ');
  s = s.replace(/\s*=\s*/g, ' igual a ')
    .replace(/\s*\+\s*/g, ' mais ')
    .replace(/-/g, ' menos ')
    .replace(/\s*\/\s*/g, ' sobre ')
    .replace(/\s*<\s*/g, ' menor que ')
    .replace(/\s*>\s*/g, ' maior que ');
  s = s.replace(/[{}\\&|]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Substitui trechos `$$…$$`, `\[…\]`, `\(…\)` e `$…$` pela fala equivalente e
 * símbolos Unicode matemáticos por nomes em PT-BR. `$` de moeda (`R$ 10`) não
 * é matemática: o `$` inline exige conteúdo colado nos dois delimitadores.
 */
export function speakMath(text: string): string {
  let out = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => ` ${verbalizeLatex(inner)} `)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => ` ${verbalizeLatex(inner)} `)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => ` ${verbalizeLatex(inner)} `)
    .replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, (_m, inner: string) => ` ${verbalizeLatex(inner)} `);
  out = out.replace(UNICODE_RE, (ch) => ` ${UNICODE[ch]} `);
  return out;
}
