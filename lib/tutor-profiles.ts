/**
 * Perfis do tutor (D7 / R13–R18). Built-ins vivem no código e são imutáveis.
 * A compilação é determinística: só inteiros validados viram instruções curtas.
 * Nome de perfil não entra no prompt — é texto do usuário.
 */

export const AXES = [
  'proactivity',
  'questioning',
  'directiveness',
  'depth',
  'pace',
  'analogies',
] as const;

export const TONE_KEYS = ['informality', 'humor', 'concision'] as const;

export type Axis = (typeof AXES)[number];
export type ToneKey = (typeof TONE_KEYS)[number];
export type TutorAxes = Record<Axis, number>;
export type TutorTone = Record<ToneKey, number>;

/** Ajuste parcial da sessão. Chave desconhecida ou fora da escala é rejeitada na escrita. */
export type ProfileOverrides = Partial<TutorAxes & TutorTone>;

export interface TutorProfile {
  id: string;
  name: string;
  builtin: boolean;
  baseProfileId: string | null;
  axes: TutorAxes;
  tone: TutorTone;
}

export class TutorProfileError extends Error {}

export const AXIS_LABELS: Record<Axis, string> = {
  proactivity: 'Proatividade',
  questioning: 'Perguntas',
  directiveness: 'Direção',
  depth: 'Profundidade',
  pace: 'Ritmo',
  analogies: 'Analogias',
};

export const TONE_LABELS: Record<ToneKey, string> = {
  informality: 'Informalidade',
  humor: 'Humor',
  concision: 'Concisão',
};

const AXIS_MAX = 4;
const TONE_MAX = 2;

/** Uma frase por nível. Níveis distintos produzem texto distinto. */
const AXIS_LINES: Record<Axis, readonly [string, string, string, string, string]> = {
  proactivity: [
    'Não antecipe o próximo passo; responda só ao que foi perguntado.',
    'Antecipe pouco; ofereça no máximo um próximo passo.',
    'Sugira um próximo passo quando isso ajudar.',
    'Proponha o próximo passo com frequência.',
    'Conduza a sequência e proponha o passo seguinte sem esperar pedido.',
  ],
  questioning: [
    'Não faça perguntas; entregue a resposta.',
    'Faça no máximo uma pergunta curta.',
    'Alterne explicação e uma pergunta de checagem.',
    'Prefira uma pergunta antes da resposta completa.',
    'Pergunte antes de explicar e espere a tentativa do usuário.',
  ],
  directiveness: [
    'Não conduza a sequência; deixe o usuário escolher o rumo.',
    'Conduza pouco; confirme o rumo antes de seguir.',
    'Sugira a ordem, mas aceite desvio.',
    'Conduza a sequência do raciocínio.',
    'Conduza a sequência passo a passo e não pule etapa.',
  ],
  depth: [
    'Fique na resposta imediata, sem abrir fundamentos.',
    'Acrescente só o fundamento necessário.',
    'Inclua o fundamento principal.',
    'Aprofunde fundamentos e uma implicação.',
    'Investigue fundamentos, implicações e conexões.',
  ],
  pace: [
    'Vá devagar e confirme cada passo.',
    'Avance devagar, com uma checagem por etapa.',
    'Mantenha ritmo moderado e checagens pontuais.',
    'Avance com poucas checagens.',
    'Avance rápido e reduza checagens.',
  ],
  analogies: [
    'Não use analogias.',
    'Use no máximo uma analogia curta, se couber.',
    'Use uma analogia quando esclarecer.',
    'Use analogias para tornar o abstrato concreto.',
    'Apoie a explicação em analogias concretas.',
  ],
};

const TONE_LINES: Record<ToneKey, readonly [string, string, string]> = {
  informality: [
    'Trato formal.',
    'Trato neutro.',
    'Trato informal, sem gíria pesada.',
  ],
  humor: [
    'Sem humor.',
    'Humor leve só se não desviar do assunto.',
    'Humor leve e breve é bem-vindo.',
  ],
  concision: [
    'Desenvolva a explicação com calma.',
    'Seja moderadamente conciso.',
    'Seja conciso; corte o que não for necessário.',
  ],
};

function axes(values: readonly number[]): TutorAxes {
  if (values.length !== AXES.length) {
    throw new TutorProfileError('Eixos incompletos.');
  }
  const out = {} as TutorAxes;
  AXES.forEach((axis, index) => {
    out[axis] = values[index]!;
  });
  return out;
}

function tone(informality: number, humor: number, concision: number): TutorTone {
  return { informality, humor, concision };
}

export const BUILTIN_PROFILES: readonly TutorProfile[] = [
  {
    id: 'conversa-livre',
    name: 'Conversa Livre',
    builtin: true,
    baseProfileId: null,
    axes: axes([2, 2, 1, 2, 2, 2]),
    tone: tone(1, 1, 1),
  },
  {
    id: 'professor-socratico',
    name: 'Professor Socrático',
    builtin: true,
    baseProfileId: null,
    axes: axes([3, 4, 1, 3, 1, 2]),
    tone: tone(1, 0, 1),
  },
  {
    id: 'explicador',
    name: 'Explicador',
    builtin: true,
    baseProfileId: null,
    axes: axes([2, 1, 3, 3, 2, 4]),
    tone: tone(1, 1, 1),
  },
  {
    id: 'resolver-comigo',
    name: 'Resolver Comigo',
    builtin: true,
    baseProfileId: null,
    axes: axes([3, 3, 4, 2, 2, 2]),
    tone: tone(1, 0, 1),
  },
  {
    id: 'revisao-rapida',
    name: 'Revisão Rápida',
    builtin: true,
    baseProfileId: null,
    axes: axes([2, 1, 3, 1, 4, 1]),
    tone: tone(1, 0, 2),
  },
  {
    id: 'professor-profundo',
    name: 'Professor Profundo',
    builtin: true,
    baseProfileId: null,
    axes: axes([2, 2, 2, 4, 0, 3]),
    tone: tone(0, 0, 0),
  },
];

const BUILTIN_BY_ID = new Map(BUILTIN_PROFILES.map((profile) => [profile.id, profile]));

export function isBuiltinProfileId(id: string): boolean {
  return BUILTIN_BY_ID.has(id);
}

export function getBuiltinProfile(id: string): TutorProfile | null {
  const profile = BUILTIN_BY_ID.get(id);
  return profile ? cloneProfile(profile) : null;
}

export function cloneProfile(profile: TutorProfile): TutorProfile {
  return {
    ...profile,
    axes: { ...profile.axes },
    tone: { ...profile.tone },
  };
}

function isAxis(key: string): key is Axis {
  return (AXES as readonly string[]).includes(key);
}

function isToneKey(key: string): key is ToneKey {
  return (TONE_KEYS as readonly string[]).includes(key);
}

function assertInteger(value: unknown, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new TutorProfileError(`${label} deve ser inteiro de 0 a ${max}.`);
  }
  return value;
}

export function parseAxes(value: unknown): TutorAxes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TutorProfileError('Eixos inválidos.');
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== AXES.length || keys.some((key) => !isAxis(key))) {
    throw new TutorProfileError('Eixos inválidos.');
  }
  const out = {} as TutorAxes;
  for (const axis of AXES) {
    out[axis] = assertInteger(input[axis], AXIS_MAX, AXIS_LABELS[axis]);
  }
  return out;
}

export function parseTone(value: unknown): TutorTone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TutorProfileError('Tom inválido.');
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== TONE_KEYS.length || keys.some((key) => !isToneKey(key))) {
    throw new TutorProfileError('Tom inválido.');
  }
  const out = {} as TutorTone;
  for (const key of TONE_KEYS) {
    out[key] = assertInteger(input[key], TONE_MAX, TONE_LABELS[key]);
  }
  return out;
}

/** Escrita de sessão: objeto plano só com eixos e tom conhecidos. `null` limpa. */
export function parseProfileOverrides(value: unknown): ProfileOverrides | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TutorProfileError('Ajustes de perfil inválidos.');
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length > AXES.length + TONE_KEYS.length) {
    throw new TutorProfileError('Ajustes de perfil grandes demais.');
  }
  const out: ProfileOverrides = {};
  for (const key of keys) {
    if (isAxis(key)) out[key] = assertInteger(input[key], AXIS_MAX, AXIS_LABELS[key]);
    else if (isToneKey(key)) out[key] = assertInteger(input[key], TONE_MAX, TONE_LABELS[key]);
    else throw new TutorProfileError('Ajustes de perfil inválidos.');
  }
  return Object.keys(out).length === 0 ? null : out;
}

/** Leitura de sessão já gravada: descarta lixo em vez de quebrar o turno. */
export function readStoredOverrides(value: unknown): ProfileOverrides | null {
  try {
    return parseProfileOverrides(value);
  } catch {
    return null;
  }
}

export function applyOverrides(profile: TutorProfile, overrides: ProfileOverrides | null): TutorProfile {
  const next = cloneProfile(profile);
  if (!overrides) return next;
  for (const axis of AXES) {
    const value = overrides[axis];
    if (value !== undefined) next.axes[axis] = value;
  }
  for (const key of TONE_KEYS) {
    const value = overrides[key];
    if (value !== undefined) next.tone[key] = value;
  }
  return next;
}

export function compileTutorInstructions(profile: Pick<TutorProfile, 'axes' | 'tone'>): string {
  const lines = [
    ...AXES.map((axis) => AXIS_LINES[axis][profile.axes[axis]]),
    ...TONE_KEYS.map((key) => TONE_LINES[key][profile.tone[key]]),
  ];
  return lines.join('\n');
}

export function validateProfileName(value: unknown): string {
  if (typeof value !== 'string') throw new TutorProfileError('Nome do perfil inválido.');
  const name = value.trim();
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f]/.test(name)) {
    throw new TutorProfileError('Nome do perfil inválido.');
  }
  return name;
}
