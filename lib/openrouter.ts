import { getOpenRouterKey } from './config';
import { logger } from './logger';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface StreamChatParams {
  apiKey: string;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

/** Env (dev/CI) → `~/.zetel/config` (canônico). */
export function readApiKey(): string {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = getOpenRouterKey();
  if (fromFile) return fromFile;
  throw new Error(
    'Chave OpenRouter não configurada. Defina OPENROUTER_API_KEY em ~/.zetel/config.',
  );
}

function logUsageSilently(usage: unknown): void {
  try {
    if (!usage || typeof usage !== 'object') return;
    const u = usage as { prompt_tokens?: number; completion_tokens?: number };
    const tokensIn = u.prompt_tokens;
    const tokensOut = u.completion_tokens;
    if (tokensIn === undefined && tokensOut === undefined) return;
    logger.info('openrouter usage', {
      tokensIn: tokensIn ?? 0,
      tokensOut: tokensOut ?? 0,
    });
  } catch {
    /* silencioso — usage é opt-in de debug */
  }
}

/** Stream de deltas de texto do OpenRouter (SSE). */
export async function* streamChat(params: StreamChatParams): AsyncIterable<string> {
  const { apiKey, model, messages, maxTokens = 1024 } = params;
  const logTokens = process.env.ZETEL_LOG_TOKENS === '1';

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
  };
  if (logTokens) {
    body.stream_options = { include_usage: true };
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
    },
    body: JSON.stringify(body),
  });

  logger.info('openrouter stream start', { model, status: res.status });

  if (!res.ok) {
    throw new Error(`OpenRouter: ${res.status}`);
  }

  if (!res.body) {
    throw new Error('OpenRouter: resposta sem corpo');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: unknown;
          };
          if (logTokens && parsed.usage) {
            logUsageSilently(parsed.usage);
          }
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          /* linha SSE malformada — ignorar */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Chamada mínima para validar chave + modelo (Configurações). */
export async function pingChat(apiKey: string, model: string): Promise<void> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ok' }],
      max_tokens: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter: ${res.status}`);
  }
}
