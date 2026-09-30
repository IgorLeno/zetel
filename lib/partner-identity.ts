/**
 * Identidade visual do parceiro (SPEC-002). Só apresentação: nada daqui entra
 * no prompt. A instrução do tutor continua vindo de `compileTutorInstructions`.
 */
import {
  AXES,
  PARTNER_COLORS,
  TONE_KEYS,
  type Axis,
  type PartnerColor,
  type ToneKey,
  type TutorProfile,
} from './tutor-profiles';

export const PARTNER_COLOR_LABELS: Record<PartnerColor, string> = {
  pessego: 'Pêssego',
  lavanda: 'Lavanda',
  mel: 'Mel',
  salvia: 'Sálvia',
  rosa: 'Rosa',
  noite: 'Noite',
  ceu: 'Céu',
  terracota: 'Terracota',
};

/** Valor CSS da cor; o tom real (claro/escuro) é decidido pelos tokens. */
export function partnerColorVar(color: PartnerColor): string {
  return `var(--partner-${color})`;
}

interface BuiltinBlurb {
  tagline: string;
  sample: string;
}

const BUILTIN_BLURBS: Record<string, BuiltinBlurb> = {
  'conversa-livre': {
    tagline: 'Bate-papo leve sobre o material',
    sample: 'Bora conversar sobre isso? Me conta o que te chamou atenção.',
  },
  'professor-socratico': {
    tagline: 'Pergunta antes de responder',
    sample: 'Antes da resposta: o que você acha que acontece se…?',
  },
  explicador: {
    tagline: 'Explica com analogias concretas',
    sample: 'Imagina assim: é como um mapa de calor visto de cima.',
  },
  'resolver-comigo': {
    tagline: 'Passo a passo, junto com você',
    sample: 'Vamos montar juntos. Primeiro passo: o que já sabemos?',
  },
  'revisao-rapida': {
    tagline: 'Direto ao ponto, ritmo alto',
    sample: 'Três pontos-chave. Pronto? Vai.',
  },
  'professor-profundo': {
    tagline: 'Fundamentos e conexões',
    sample: 'Isso se conecta com um princípio mais geral — vamos ver por quê.',
  },
};

/** Rótulos humanos dos extremos de cada escala, usados no editor. */
export const AXIS_ENDS: Record<Axis, readonly [string, string]> = {
  proactivity: ['Espera você', 'Conduz'],
  questioning: ['Só responde', 'Pergunta antes'],
  directiveness: ['Você escolhe o rumo', 'Guia passo a passo'],
  depth: ['Resposta imediata', 'Fundamentos'],
  pace: ['Devagar', 'Rápido'],
  analogies: ['Nenhuma', 'Muitas'],
};

export const TONE_ENDS: Record<ToneKey, readonly [string, string]> = {
  informality: ['Formal', 'Informal'],
  humor: ['Sério', 'Brincalhão'],
  concision: ['Desenvolve', 'Conciso'],
};

export const LEVEL_WORDS_5 = ['mínimo', 'pouco', 'médio', 'bastante', 'máximo'] as const;
export const LEVEL_WORDS_3 = ['baixo', 'médio', 'alto'] as const;

const TRAIT_HIGH: Partial<Record<Axis | ToneKey, string>> = {
  questioning: 'Muitas perguntas',
  analogies: 'Analogias',
  depth: 'Profundo',
  pace: 'Rápido',
  directiveness: 'Conduz',
  proactivity: 'Proativo',
  informality: 'Informal',
  humor: 'Bem-humorado',
  concision: 'Conciso',
};

const TRAIT_LOW: Partial<Record<Axis | ToneKey, string>> = {
  pace: 'Calmo',
  questioning: 'Direto',
  informality: 'Formal',
  concision: 'Detalhista',
};

/**
 * Vértices do radar (SVG 160×160) para o nível de cada eixo pedagógico, 0–4.
 * `scale` fixo desenha os anéis de referência. Primeiro eixo no topo.
 */
export function radarPoints(axes: TutorProfile['axes'], scale?: number): string {
  const center = 80;
  const radius = 58;
  return AXES.map((axis, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
    const r = radius * (scale ?? axes[axis] / 4);
    return `${(center + Math.cos(angle) * r).toFixed(1)},${(center + Math.sin(angle) * r).toFixed(1)}`;
  }).join(' ');
}

/** Até três traços derivados das escalas — o suficiente para reconhecer o parceiro. */
export function partnerTraits(profile: Pick<TutorProfile, 'axes' | 'tone'>): string[] {
  const scored: { label: string; weight: number }[] = [];
  for (const axis of AXES) {
    const value = profile.axes[axis];
    if (value >= 3 && TRAIT_HIGH[axis]) scored.push({ label: TRAIT_HIGH[axis]!, weight: value });
    if (value <= 0 && TRAIT_LOW[axis]) scored.push({ label: TRAIT_LOW[axis]!, weight: 3 });
  }
  for (const key of TONE_KEYS) {
    const value = profile.tone[key];
    if (value >= 2 && TRAIT_HIGH[key]) scored.push({ label: TRAIT_HIGH[key]!, weight: 3 });
    if (value <= 0 && TRAIT_LOW[key]) scored.push({ label: TRAIT_LOW[key]!, weight: 2 });
  }
  scored.sort((a, b) => b.weight - a.weight);
  const traits = [...new Set(scored.map((item) => item.label))].slice(0, 3);
  return traits.length > 0 ? traits : ['Equilibrado'];
}

export function partnerTagline(profile: TutorProfile): string {
  return BUILTIN_BLURBS[profile.id]?.tagline ?? 'Parceiro criado por você';
}

export function partnerSample(profile: TutorProfile): string | null {
  return BUILTIN_BLURBS[profile.id]?.sample ?? null;
}

export { PARTNER_COLORS };
export type { PartnerColor };
