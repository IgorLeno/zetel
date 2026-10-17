import { NextResponse } from 'next/server';

/**
 * Guarda contra CSRF em `/api` (SPEC-017). O Zetel não tem sessão nem token:
 * qualquer página aberta no navegador consegue mandar POST para `localhost`,
 * e um POST `text/plain` não passa por preflight CORS. Por isso as mutações
 * só aceitam a própria origem e um Host local (DNS rebinding faz Origin e Host
 * coincidirem num domínio do atacante que resolve para 127.0.0.1).
 *
 * Sem dependência de Node: usada pelo middleware e pelas rotas de segredo.
 */

export type GuardReason = 'cross-site' | 'origin-mismatch' | 'host-not-allowed' | 'not-json';
export type GuardFailure = { status: 403 | 415; reason: GuardReason };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
// `none` = navegação iniciada pelo usuário; só `same-origin` vem de fetch do app.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

const MESSAGES: Record<GuardFailure['status'], string> = {
  403: 'Origem da requisição não permitida.',
  415: 'Content-Type deve ser application/json.',
};

/** Hostnames extras de `ZETEL_ALLOWED_HOSTS` (lista por vírgula, sem porta). */
export function allowedHostsFromEnv(raw: string | undefined = process.env.ZETEL_ALLOWED_HOSTS): string[] {
  if (!raw) return [];
  return raw.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * `null` = pode seguir. Requisição sem `Origin` e sem `Sec-Fetch-Site` passa:
 * navegadores sempre mandam ao menos um deles em POST cross-site, então a
 * ausência indica cliente não navegador (curl, scripts, testes).
 */
export function checkMutationOrigin(input: {
  method: string;
  url: string;
  headers: Headers;
  allowedHosts?: readonly string[];
}): GuardFailure | null {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return null;

  const host = (input.headers.get('host') ?? new URL(input.url).host).toLowerCase();
  const hostname = hostnameOf(host);
  const allowed = [...LOOPBACK_HOSTS, ...(input.allowedHosts ?? [])];
  if (!hostname || !allowed.includes(hostname)) {
    return { status: 403, reason: 'host-not-allowed' };
  }

  const fetchSite = input.headers.get('sec-fetch-site');
  if (fetchSite !== null && !ALLOWED_FETCH_SITES.has(fetchSite.toLowerCase())) {
    return { status: 403, reason: 'cross-site' };
  }

  const origin = input.headers.get('origin');
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      // Inclui `Origin: null` (iframe sandbox, file://, redirect cross-site).
      return { status: 403, reason: 'origin-mismatch' };
    }
    if (originHost !== host) return { status: 403, reason: 'origin-mismatch' };
  }
  return null;
}

export function guardErrorResponse(failure: GuardFailure): NextResponse {
  return NextResponse.json({ error: MESSAGES[failure.status] }, { status: failure.status });
}

/**
 * Defesa em profundidade nas rotas que gravam segredos: repete a origem (não
 * depende do middleware) e exige JSON, que obriga o navegador a fazer
 * preflight em chamadas cross-site.
 */
export function requireSameOriginJson(request: Request): NextResponse | null {
  const failure = checkMutationOrigin({
    method: request.method,
    url: request.url,
    headers: request.headers,
    allowedHosts: allowedHostsFromEnv(),
  });
  if (failure) return guardErrorResponse(failure);

  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return guardErrorResponse({ status: 415, reason: 'not-json' });
  }
  return null;
}
