import { resolveOpenRouterCredential } from './config';
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
  /** Abort do cliente (Parar) encerra o fetch upstream. */
  signal?: AbortSignal;
}

/** Credencial efetiva: arquivo local primeiro, ambiente como fallback. */
export function readApiKey(): string {
  const credential = resolveOpenRouterCredential();
  if (credential.key) return credential.key;
  throw new Error('Chave OpenRouter não configurada.');
}

export type OpenRouterErrorKind =
  | 'auth'
  | 'account-rate-limit'
  | 'key-rate-limit'
  | 'provider-rate-limit'
  | 'credits'
  | 'model-unavailable'
  | 'rate-limit-unknown'
  | 'unknown';

/**
 * Únicos campos lidos do body de erro remoto. `message` só alimenta a
 * classificação e nunca sai do servidor; `providerName` é normalizado.
 */
export interface OpenRouterErrorInfo {
  code: number | null;
  message: string | null;
  providerName: string | null;
}

function safeProviderName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[\w .-]{1,40}$/.test(trimmed) ? trimmed : null;
}

/** Lê `{ error: { code, message, metadata.provider_name } }`; qualquer outra coisa é ignorada. */
export async function readOpenRouterErrorInfo(res: Response): Promise<OpenRouterErrorInfo | null> {
  try {
    const data = (await res.json()) as { error?: { code?: unknown; message?: unknown; metadata?: unknown } };
    const error = data?.error;
    if (!error || typeof error !== 'object') return null;
    const metadata = error.metadata && typeof error.metadata === 'object'
      ? error.metadata as { provider_name?: unknown } : null;
    return {
      code: typeof error.code === 'number' ? error.code : null,
      message: typeof error.message === 'string' ? error.message.slice(0, 500) : null,
      providerName: safeProviderName(metadata?.provider_name),
    };
  } catch {
    return null;
  }
}

/**
 * Classifica só com evidência: erro de upstream traz `metadata.provider_name`
 * (ou a mensagem padrão "Provider returned error"); limites de modelos free são
 * por conta; "key limit" é explícito. Sem evidência, 429 fica `rate-limit-unknown`.
 */
export function classifyOpenRouterError(status: number, info: OpenRouterErrorInfo | null): OpenRouterErrorKind {
  const message = info?.message ?? '';
  if (status === 401) return 'auth';
  if (/key limit/i.test(message)) return 'key-rate-limit';
  if (status === 402) return 'credits';
  if (status === 400 || status === 404) return 'model-unavailable';
  if (status !== 429) return 'unknown';
  if (info?.providerName || /provider returned error/i.test(message)) return 'provider-rate-limit';
  if (/free-models-per-(day|min)/i.test(message)) return 'account-rate-limit';
  return 'rate-limit-unknown';
}

function messageFor(status: number, kind: OpenRouterErrorKind, providerName: string | null): string {
  switch (kind) {
    case 'auth': return 'OpenRouter rejeitou a credencial (401).';
    case 'credits': return 'Créditos OpenRouter insuficientes (402).';
    case 'key-rate-limit': return `Limite da chave OpenRouter atingido (${status}).`;
    case 'model-unavailable': return `Modelo OpenRouter inválido ou indisponível (${status}).`;
    case 'provider-rate-limit':
      return `Modelo temporariamente indisponível: o provedor${providerName ? ` ${providerName}` : ''} limitou as requisições (429). Tente de novo em instantes ou escolha outro modelo.`;
    case 'account-rate-limit': return 'Limite de requisições da conta OpenRouter atingido (429).';
    case 'rate-limit-unknown': return 'Limite de requisições do OpenRouter (429).';
    default: return `OpenRouter falhou (HTTP ${status}).`;
  }
}

/** Mensagens HTTP seguras: o body remoto nunca é repassado, só classificado. */
export class OpenRouterHttpError extends Error {
  readonly kind: OpenRouterErrorKind;
  readonly providerName: string | null;

  constructor(readonly status: number, info: OpenRouterErrorInfo | null = null) {
    const kind = classifyOpenRouterError(status, info);
    const providerName = kind === 'provider-rate-limit' ? info?.providerName ?? null : null;
    super(messageFor(status, kind, providerName));
    this.kind = kind;
    this.providerName = providerName;
  }
}

export async function openRouterHttpError(res: Response): Promise<OpenRouterHttpError> {
  return new OpenRouterHttpError(res.status, await readOpenRouterErrorInfo(res));
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
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const abortError = new Error('aborted');
  abortError.name = 'AbortError';
  throw abortError;
}

export async function* streamChat(params: StreamChatParams): AsyncIterable<string> {
  const { apiKey, model, messages, maxTokens = 1024, usageSink, signal } = params;
  const logTokens = process.env.ZETEL_LOG_TOKENS === '1';
  throwIfAborted(signal);

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
    signal,
  });

  logger.info('openrouter stream start', { model, status: res.status });

  if (!res.ok) {
    throw await openRouterHttpError(res);
  }

  if (!res.body) {
    throw new Error('OpenRouter: resposta sem corpo');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      throwIfAborted(signal);

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
  /**
   * Quando true (default), envia `response_format: { type: "json_object" }`.
   * Callers que não suportam JSON mode devem passar `false`.
   */
  jsonMode?: boolean;
}

export interface RequestJsonResult {
  content: string;
  usage: RequestUsage | null;
}

const REQUEST_JSON_TIMEOUT_MS = 120_000;

/**
 * Chamada NÃO-streaming para resposta JSON (Módulo 10D / Guia de Estudo).
 * Espelha o padrão de `streamChat` (fetch, mesmos headers, sem SDK) e do spike
 * `run-guia.mjs`. Com `jsonMode` (default), pede JSON nativo ao provedor;
 * parser tolerante downstream permanece (R6). Não loga conteúdo (regra #6).
 */
export async function requestJson(params: RequestJsonParams): Promise<RequestJsonResult> {
  const { apiKey, model, system, user, maxTokens, temperature = 0.3, jsonMode = true } = params;
  const timeoutMs = params.timeoutMs ?? REQUEST_JSON_TIMEOUT_MS;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    stream: false,
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

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
      body: JSON.stringify(body),
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
    try {
      throw await openRouterHttpError(res);
    } finally {
      clearTimeout(timer);
    }
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

const PING_CHAT_TIMEOUT_MS = 15_000;

/** Chamada mínima para validar chave + modelo (Configurações). */
export async function pingChat(apiKey: string, model: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_CHAT_TIMEOUT_MS);

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
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`OpenRouter: timeout após ${Math.round(PING_CHAT_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw await openRouterHttpError(res);
  }
}
