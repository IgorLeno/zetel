/**
 * Opções de voz TTS (SPEC-005 D3): módulo puro, seguro para o cliente.
 * Lista de vozes conferida na doc oficial da OpenAI em 2026-10-03; a API não
 * expõe endpoint de vozes, então a lista é mantida aqui.
 */

export const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_TTS_VOICE = 'marin';
export const MAX_TTS_INSTRUCTIONS_CHARS = 2000;

/** Tom padrão da parceira (SPEC-004 D2); ajustável por `tts_instructions`. */
export const DEFAULT_TTS_INSTRUCTIONS = [
  'Fale em português do Brasil, com sotaque brasileiro neutro e pouco carregado, com uma leve naturalidade mineira. Nunca use sotaque de Portugal.',
  'Timbre macio, tom calmo e próximo; transmita confiança e clareza.',
  'Calor humano moderado e energia média: viva, sem entusiasmo de apresentador nem tom de atendimento ao cliente.',
  'Ritmo tranquilo e fluido, sem pressa e sem pausas artificiais.',
  'Mude a entonação de forma discreta para marcar distinções, ênfases e humor leve.',
  'Soe como uma conversa entre colegas de estudo, nunca como locução.',
].join(' ');

export const TTS_MODELS = [
  { id: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts — natural, aceita tom' },
  { id: 'tts-1', label: 'tts-1 — rápido, ignora o tom' },
  { id: 'tts-1-hd', label: 'tts-1-hd — mais qualidade, ignora o tom' },
] as const;

/** `legacy`: também existe em `tts-1`/`tts-1-hd`. */
export const TTS_VOICES = [
  { id: 'alloy', legacy: true },
  { id: 'ash', legacy: true },
  { id: 'ballad', legacy: false },
  { id: 'coral', legacy: true },
  { id: 'echo', legacy: true },
  { id: 'fable', legacy: true },
  { id: 'nova', legacy: true },
  { id: 'onyx', legacy: true },
  { id: 'sage', legacy: true },
  { id: 'shimmer', legacy: true },
  { id: 'verse', legacy: false },
  { id: 'marin', legacy: false },
  { id: 'cedar', legacy: false },
] as const;

export function isTtsModel(model: string): boolean {
  return TTS_MODELS.some((m) => m.id === model);
}

export function isTtsVoice(voice: string): boolean {
  return TTS_VOICES.some((v) => v.id === voice);
}

/** `tts-1` e `tts-1-hd` não aceitam `instructions` (SPEC-004 D3). */
export function ttsModelSupportsInstructions(model: string): boolean {
  return !/^tts-1(-|$)/.test(model);
}

/** Vozes novas (ballad, verse, marin, cedar) só existem nos modelos que aceitam tom. */
export function ttsVoiceSupportedBy(model: string, voice: string): boolean {
  const entry = TTS_VOICES.find((v) => v.id === voice);
  if (!entry) return false;
  return entry.legacy || ttsModelSupportsInstructions(model);
}

export const TTS_TONE_PRESETS = [
  { id: 'calmo', label: 'Calmo e próximo (padrão)', instructions: DEFAULT_TTS_INSTRUCTIONS },
  {
    id: 'professor',
    label: 'Professor direto',
    instructions: [
      'Fale em português do Brasil, com sotaque brasileiro neutro. Nunca use sotaque de Portugal.',
      'Tom firme, claro e objetivo, como um professor experiente explicando a um aluno.',
      'Energia média, articulação precisa e ritmo constante; destaque termos-chave com ênfase leve.',
      'Sem floreios nem entusiasmo forçado; soe confiante e didático, nunca como locução.',
    ].join(' '),
  },
  {
    id: 'descontraido',
    label: 'Descontraído',
    instructions: [
      'Fale em português do Brasil, com sotaque brasileiro neutro e informal. Nunca use sotaque de Portugal.',
      'Tom leve, animado e bem-humorado, como um amigo que adora o assunto.',
      'Energia alta sem exagero, entonação variada e ritmo solto; sorria na voz.',
      'Soe como conversa casual, nunca como apresentador ou locução.',
    ].join(' '),
  },
  {
    id: 'neutro',
    label: 'Neutro',
    instructions: [
      'Fale em português do Brasil, com sotaque brasileiro neutro. Nunca use sotaque de Portugal.',
      'Tom neutro e equilibrado, sem emoção marcada.',
      'Energia moderada, ritmo regular e dicção clara.',
    ].join(' '),
  },
] as const;

/** id do preset cujo texto bate exatamente com `instructions`, ou `null` (personalizado). */
export function matchTonePreset(instructions: string): string | null {
  const trimmed = instructions.trim();
  return TTS_TONE_PRESETS.find((p) => p.instructions === trimmed)?.id ?? null;
}
