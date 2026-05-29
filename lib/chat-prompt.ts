import type { ChatMessage } from '@/types/chat-message';
import type { NoteTipo } from './notes-service';

const PAGE_CONTEXT_MAX = 3000;

/** Marcadores que delimitam o bloco JSON de sugestão de nota no stream (Módulo 6). */
export const NOTE_MARK_START = '<<<NOTA_SUGERIDA>>>';
export const NOTE_MARK_END = '<<<FIM_NOTA>>>';

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Sugestão de nota validada, sem `justificativa` (essa nunca sai do backend). */
export interface NoteSuggestion {
  tipo: NoteTipo;
  titulo: string;
  corpo: string;
  paginaOrigem: string | null;
}

export function truncatePageContext(text: string): string {
  if (text.length <= PAGE_CONTEXT_MAX) return text;
  return text.slice(0, PAGE_CONTEXT_MAX) + '...';
}

export function buildOpenRouterMessages(opts: {
  displayName: string;
  pageContent: string | null;
  history: ChatMessage[];
  userMessage: string;
  noteRubric?: string;
  existingTitles?: string[];
}): OpenRouterMessage[] {
  let systemContent = `Você é um parceiro de estudos do Zetel "${opts.displayName}". Responda sempre em PT-BR. Seja preciso e objetivo.`;
  if (opts.noteRubric) {
    systemContent += `\n\n${opts.noteRubric}`;
  }
  if (opts.existingTitles && opts.existingTitles.length > 0) {
    systemContent += `\n\nNotas já existentes neste Zetel (não duplique):\n- ${opts.existingTitles.join('\n- ')}`;
  }

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: systemContent,
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

function isTipo(v: unknown): v is NoteTipo {
  return v === 'rapida' || v === 'literatura';
}

/**
 * Separa a resposta do parceiro em narrativa visível + sugestão de nota (se houver).
 * O bloco delimitado por NOTE_MARK_START/END é extraído e validado; a `justificativa`
 * é descartada aqui — nunca trafega para o cliente (regra: nunca exibida na UI).
 * JSON malformado degrada para resposta normal (suggestion = null).
 */
export function extractNoteSuggestion(fullContent: string): {
  narrative: string;
  suggestion: NoteSuggestion | null;
} {
  const start = fullContent.indexOf(NOTE_MARK_START);
  if (start === -1) return { narrative: fullContent.trim(), suggestion: null };

  const narrative = fullContent.slice(0, start).trim();
  const afterStart = fullContent.slice(start + NOTE_MARK_START.length);
  const endRel = afterStart.indexOf(NOTE_MARK_END);
  const jsonRaw = (endRel === -1 ? afterStart : afterStart.slice(0, endRel)).trim();

  try {
    const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
    if (
      !isTipo(parsed.tipo) ||
      typeof parsed.titulo !== 'string' ||
      typeof parsed.corpo !== 'string' ||
      !parsed.titulo.trim() ||
      !parsed.corpo.trim()
    ) {
      return { narrative, suggestion: null };
    }
    const paginaOrigem =
      typeof parsed.pagina_origem === 'string' && parsed.pagina_origem.trim() && parsed.pagina_origem !== 'null'
        ? parsed.pagina_origem.trim()
        : null;
    return {
      narrative,
      suggestion: {
        tipo: parsed.tipo,
        titulo: parsed.titulo.trim(),
        corpo: parsed.corpo.trim(),
        paginaOrigem,
      },
    };
  } catch {
    return { narrative, suggestion: null };
  }
}
