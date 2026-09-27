/** Pedido explícito para a professora começar. Não aceita texto livre. */
export const CHAT_STARTERS = ['contextualize', 'explain', 'ask-question', 'discuss'] as const;

export type ChatStarter = (typeof CHAT_STARTERS)[number];

const STARTER_SET = new Set<string>(CHAT_STARTERS);

const CANONICAL: Record<ChatStarter, string> = {
  contextualize: 'Contextualize este trecho.',
  explain: 'Explique este trecho.',
  'ask-question': 'Me faça uma pergunta sobre este trecho.',
  discuss: 'Vamos conversar sobre este trecho.',
};

const INSTRUCTION: Record<ChatStarter, string> = {
  contextualize:
    'Explique onde o foco atual se encaixa no material e quais ideias próximas ajudam a entendê-lo.',
  explain:
    'Explique o foco atual. A forma de explicar segue o perfil pedagógico já definido para esta sessão.',
  'ask-question':
    'Faça uma pergunta útil sobre o foco atual para verificar ou aprofundar a compreensão. O estilo da pergunta segue o perfil pedagógico da sessão.',
  discuss:
    'Inicie uma conversa natural sobre o foco atual, no tom do perfil pedagógico da sessão.',
};

/** `null` = campo ausente. `'invalid'` = valor que não está no conjunto fechado. */
export function parseChatStarter(value: unknown): ChatStarter | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !STARTER_SET.has(value)) return 'invalid';
  return value as ChatStarter;
}

export function starterCanonical(starter: ChatStarter): string {
  return CANONICAL[starter];
}

export function starterInstruction(starter: ChatStarter): string {
  return INSTRUCTION[starter];
}
