import type { ChatMessage } from '@/types/chat-message';

const PAGE_CONTEXT_MAX = 3000;

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function truncatePageContext(text: string): string {
  if (text.length <= PAGE_CONTEXT_MAX) return text;
  return text.slice(0, PAGE_CONTEXT_MAX) + '...';
}

export function buildOpenRouterMessages(opts: {
  displayName: string;
  pageContent: string | null;
  history: ChatMessage[];
  userMessage: string;
}): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `Você é um parceiro de estudos do Zetel "${opts.displayName}". Responda sempre em PT-BR. Seja preciso e objetivo.`,
    },
  ];

  if (opts.pageContent) {
    messages.push({
      role: 'user',
      content: `Contexto da página atual:\n\n${truncatePageContext(opts.pageContent)}`,
    });
    messages.push({
      role: 'assistant',
      content: 'Entendido. Estou pronto para discutir este trecho.',
    });
  }

  for (const m of opts.history) {
    messages.push({
      role: m.role,
      content: m.content,
    });
  }

  messages.push({ role: 'user', content: opts.userMessage });
  return messages;
}

export function resolveChatModel(
  bodyModel: string | undefined,
  settingsModel: string | null,
  configModel: string,
): string {
  if (bodyModel?.trim()) return bodyModel.trim();
  if (settingsModel?.trim()) return settingsModel.trim();
  return configModel;
}

export function resolveHistoryWindow(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(n)) return 10;
  return Math.min(50, Math.max(1, n));
}
