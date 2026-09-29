import { getOpenRouterModel, resolveOpenRouterCredential } from './config';
import { resolveChatModel } from './chat-prompt';
import { getSetting } from './settings';
import { logger } from './logger';

const KEY_URL = 'https://openrouter.ai/api/v1/key';
const KEY_TIMEOUT_MS = 10_000;

/** Modelo que o chat usa sem override da requisição (mesma ordem da rota de chat). */
export function effectiveChatModel(): string {
  return resolveChatModel(
    undefined,
    getSetting('chat_model') || getSetting('default_model'),
    getOpenRouterModel(),
  );
}

/**
 * Estado da chave segundo `GET /api/v1/key`. Só campos numéricos/booleanos
 * conhecidos saem daqui; label, ids e demais metadados da conta são descartados.
 */
export interface OpenRouterKeyStatus {
  /** true: 200; false: 401; null: não verificável (rede, timeout, outro HTTP). */
  authenticated: boolean | null;
  httpStatus: number | null;
  usage: number | null;
  usageDaily: number | null;
  /** null quando a chave não tem limite de gasto. */
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  isFreeTier: boolean | null;
  /** Evidência direta de bloqueio: limite definido e nada restante. */
  blockedBy: 'key-rate-limit' | null;
}

export interface OpenRouterDiagnostics {
  configured: boolean;
  source: 'config' | 'environment' | null;
  model: string;
  key: OpenRouterKeyStatus | null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function emptyStatus(authenticated: boolean | null, httpStatus: number | null): OpenRouterKeyStatus {
  return {
    authenticated, httpStatus, usage: null, usageDaily: null, limit: null,
    limitRemaining: null, limitReset: null, isFreeTier: null, blockedBy: null,
  };
}

export async function fetchOpenRouterKeyStatus(apiKey: string): Promise<OpenRouterKeyStatus> {
  let res: Response;
  try {
    res = await fetch(KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(KEY_TIMEOUT_MS),
    });
  } catch {
    logger.warn('openrouter key status unreachable');
    return emptyStatus(null, null);
  }

  if (!res.ok) {
    logger.warn('openrouter key status failed', { status: res.status });
    return emptyStatus(res.status === 401 ? false : null, res.status);
  }

  let data: Record<string, unknown> = {};
  try {
    const body = (await res.json()) as { data?: unknown };
    if (body?.data && typeof body.data === 'object') data = body.data as Record<string, unknown>;
  } catch {
    /* 200 sem JSON: autenticou, mas sem metadados */
  }
  const limit = num(data.limit);
  const limitRemaining = num(data.limit_remaining);
  const limitReset = typeof data.limit_reset === 'string' && /^[a-z]{1,16}$/i.test(data.limit_reset)
    ? data.limit_reset : null;
  const status: OpenRouterKeyStatus = {
    authenticated: true,
    httpStatus: res.status,
    usage: num(data.usage),
    usageDaily: num(data.usage_daily),
    limit,
    limitRemaining,
    limitReset,
    isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
    blockedBy: limit !== null && limitRemaining !== null && limitRemaining <= 0 ? 'key-rate-limit' : null,
  };
  logger.info('openrouter key status ok', { blocked: status.blockedBy ? 1 : 0 });
  return status;
}

/** Diagnóstico sem completion: credencial efetiva, modelo do chat e metadados da chave. */
export async function diagnoseOpenRouter(): Promise<OpenRouterDiagnostics> {
  const credential = resolveOpenRouterCredential();
  const model = effectiveChatModel();
  if (!credential.key) {
    return { configured: false, source: null, model, key: null };
  }
  return {
    configured: true,
    source: credential.source,
    model,
    key: await fetchOpenRouterKeyStatus(credential.key),
  };
}
