import { getOpenRouterKey } from './config';
import { logger } from './logger';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Contagens de tokens do turno, preenchidas por `streamChat` quando a API as envia. */
export interface UsageSink {
  tokensIn?: number;
  tokensOut?: number;
}

export interface StreamChatParams {
  apiKey: string;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  /** Objeto mutável que recebe as contagens de tokens ao fim do stream (D8 / meta). */
  usageSink?: UsageSink;
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

/** Extrai contagens de uso para o sink (e loga só se ZETEL_LOG_TOKENS=1). */
function captureUsage(usage: unknown, sink: UsageSink | undefined, logTokens: boolean): void {
  try {
    if (!usage || typeof usage !== 'object') return;
    const u = usage as { prompt_tokens?: number; completion_tokens?: number };
    if (u.prompt_tokens === undefined && u.completion_tokens === undefined) return;
    if (sink) {
      if (u.prompt_tokens !== undefined) sink.tokensIn = u.prompt_tokens;
      if (u.completion_tokens !== undefined) sink.tokensOut = u.completion_tokens;
    }
    if (logTokens) {
      logger.info('openrouter usage', {
        tokensIn: u.prompt_tokens ?? 0,
        tokensOut: u.completion_tokens ?? 0,
      });
    }
  } catch {
    /* contagens são best-effort — nunca quebram o stream */
  }
}

/** Stream de deltas de texto do OpenRouter (SSE). */
export async function* streamChat(params: StreamChatParams): AsyncIterable<string> {
  const { apiKey, model, messages, maxTokens = 1024, usageSink } = params;
  const logTokens = process.env.ZETEL_LOG_TOKENS === '1';

  // Sempre pedimos usage: as contagens vão para `chat_messages.meta` (são números,
  // não conteúdo de usuário — regra #6 preservada). O log do arquivo continua opt-in.
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    max_tokens: maxTokens,
    stream_options: { include_usage: true },
  };

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
          if (parsed.usage) {
            captureUsage(parsed.usage, usageSink, logTokens);
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

/** Contagens de uso de uma chamada não-streaming. */
export interface RequestUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RequestJsonParams {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Timeout em ms (default 120s, como o spike 10C). */
  timeoutMs?: number;
}

export interface RequestJsonResult {
  content: string;
  usage: RequestUsage | null;
}

const REQUEST_JSON_TIMEOUT_MS = 120_000;

/**
 * Chamada NÃO-streaming pedindo JSON estruturado (Módulo 10D / Guia de Estudo).
 * Espelha o padrão de `streamChat` (fetch, mesmos headers, sem SDK) e do spike
 * `run-guia.mjs`. Pede `response_format: json_object`; modelos que o ignoram ainda
 * funcionam pelo parser tolerante a montante (R6). Não loga conteúdo (regra #6).
 */
export async function requestJson(params: RequestJsonParams): Promise<RequestJsonResult> {
  const { apiKey, model, system, user, maxTokens, temperature = 0.3 } = params;
  const timeoutMs = params.timeoutMs ?? REQUEST_JSON_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenRouter: timeout após ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  }

  logger.info('openrouter requestJson', { model, status: res.status });

  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(`OpenRouter: ${res.status}`);
  }

  let data: {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  try {
    data = (await res.json()) as typeof data;
  } finally {
    clearTimeout(timer);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenRouter: resposta sem conteúdo de texto.');
  }

  const u = data.usage;
  const usage: RequestUsage | null = u
    ? {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      }
    : null;

  return { content, usage };
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
