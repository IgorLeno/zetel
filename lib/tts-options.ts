/**
 * Opções de voz TTS (SPEC-005 D3; SPEC-013 D1–D3): módulo puro, seguro para o
 * cliente. Catálogo estático e curado por provedor: vozes OpenAI conferidas na
 * doc oficial em 2026-10-03 (a API não expõe endpoint de vozes); vozes do
 * Gemini conferidas no catálogo público do OpenRouter em 2026-10-16; o Gemini
 * 3.8 Flash Lite TTS lista as mesmas 30 vozes (`/api/v1/models`, 2026-10-24).
 * GPT Audio Mini não está no `/audio/speech` do OpenRouter, só no chat com
 * saída de áudio, e o catálogo não expõe vozes: usa as vozes de chat-áudio do
 * SDK oficial da OpenAI (2026-10-24), sem smoke live.
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

export const TTS_PROVIDERS = ['openai', 'openrouter'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

/** Vozes OpenAI. `legacy`: também existe em `tts-1`/`tts-1-hd`. */
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

const OPENAI_VOICES: readonly string[] = TTS_VOICES.map((v) => v.id);
const OPENAI_LEGACY_VOICES: readonly string[] = TTS_VOICES.filter((v) => v.legacy).map((v) => v.id);

/**
 * Vozes do `audio.voice` em chat completions: interseção do tipo e do
 * comentário de `ChatCompletionAudioParam` no `openai-node` (as duas listas
 * divergem em fable, nova, onyx e verse; ficam fora até prova contrária).
 */
export const GPT_AUDIO_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'marin', 'cedar',
] as const;

/** Vozes do Gemini 3.8 Flash (Lite) TTS; ids diferenciam maiúsculas (D2, D9). */
export const GEMINI_TTS_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const;

/**
 * `speech`: `POST /audio/speech` (OpenAI ou OpenRouter). `chat-audio`: modelo
 * de chat com saída de áudio, chamado por `/chat/completions` no OpenRouter.
 */
export type TtsEndpoint = 'speech' | 'chat-audio';

export interface TtsModelEntry {
  id: string;
  provider: TtsProvider;
  endpoint: TtsEndpoint;
  label: string;
  supportsInstructions: boolean;
  voices: readonly string[];
  defaultVoice: string;
}

/** Cadastrar modelo novo = uma entrada aqui (D2). */
export const TTS_MODELS: readonly TtsModelEntry[] = [
  {
    id: 'gpt-4o-mini-tts',
    provider: 'openai',
    endpoint: 'speech',
    label: 'gpt-4o-mini-tts — natural, aceita tom',
    supportsInstructions: true,
    voices: OPENAI_VOICES,
    defaultVoice: DEFAULT_TTS_VOICE,
  },
  {
    id: 'tts-1',
    provider: 'openai',
    endpoint: 'speech',
    label: 'tts-1 — rápido, ignora o tom',
    supportsInstructions: false,
    voices: OPENAI_LEGACY_VOICES,
    defaultVoice: 'alloy',
  },
  {
    id: 'tts-1-hd',
    provider: 'openai',
    endpoint: 'speech',
    label: 'tts-1-hd — mais qualidade, ignora o tom',
    supportsInstructions: false,
    voices: OPENAI_LEGACY_VOICES,
    defaultVoice: 'alloy',
  },
  {
    id: 'openai/gpt-audio-mini',
    provider: 'openrouter',
    endpoint: 'chat-audio',
    label: 'GPT Audio Mini — natural, aceita tom',
    // O tom vai como mensagem de sistema do chat com saída de áudio.
    supportsInstructions: true,
    voices: GPT_AUDIO_VOICES,
    defaultVoice: DEFAULT_TTS_VOICE,
  },
  {
    id: 'google/gemini-3.8-flash-lite-tts',
    provider: 'openrouter',
    endpoint: 'speech',
    label: 'Gemini 3.8 Flash Lite TTS — mais barato, ignora o tom',
    supportsInstructions: false,
    voices: GEMINI_TTS_VOICES,
    defaultVoice: 'Kore',
  },
  {
    id: 'google/gemini-3.8-flash-tts',
    provider: 'openrouter',
    endpoint: 'speech',
    label: 'Gemini 3.8 Flash TTS — mais expressivo, ignora o tom',
    // A página e a API do OpenRouter não expõem instruções (D3).
    supportsInstructions: false,
    voices: GEMINI_TTS_VOICES,
    defaultVoice: 'Kore',
  },
];

export function ttsModelEntry(model: string): TtsModelEntry | undefined {
  return TTS_MODELS.find((m) => m.id === model);
}

export function isTtsModel(model: string): boolean {
  return ttsModelEntry(model) !== undefined;
}

export function isTtsVoice(voice: string): boolean {
  return TTS_MODELS.some((m) => m.voices.includes(voice));
}

/** Fora do catálogo = OpenAI (settings legados da SPEC-005). */
export function ttsProviderOf(model: string): TtsProvider {
  return ttsModelEntry(model)?.provider ?? 'openai';
}

/** Fora do catálogo = `speech` (OpenAI legado). */
export function ttsEndpointOf(model: string): TtsEndpoint {
  return ttsModelEntry(model)?.endpoint ?? 'speech';
}

/** Catálogo primeiro; fora dele, `tts-1*` não aceita `instructions` (SPEC-004 D3). */
export function ttsModelSupportsInstructions(model: string): boolean {
  return ttsModelEntry(model)?.supportsInstructions ?? !/^tts-1(-|$)/.test(model);
}

/** Fora do catálogo: vozes novas da OpenAI só nos modelos que aceitam tom. */
export function ttsVoicesFor(model: string): readonly string[] {
  const entry = ttsModelEntry(model);
  if (entry) return entry.voices;
  return ttsModelSupportsInstructions(model) ? OPENAI_VOICES : OPENAI_LEGACY_VOICES;
}

export function ttsDefaultVoiceFor(model: string): string {
  const entry = ttsModelEntry(model);
  if (entry) return entry.defaultVoice;
  return ttsModelSupportsInstructions(model) ? DEFAULT_TTS_VOICE : 'alloy';
}

export function ttsVoiceSupportedBy(model: string, voice: string): boolean {
  return ttsVoicesFor(model).includes(voice);
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
