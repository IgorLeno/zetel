import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { allowedHostsFromEnv, checkMutationOrigin, guardErrorResponse } from '@/lib/request-guard';

/**
 * Barra mutações cross-site em toda a `/api` (SPEC-017 D1). Runtime Node para
 * ler `ZETEL_ALLOWED_HOSTS` em execução e usar o logger de arquivo (D7).
 */
export const config = { matcher: '/api/:path*', runtime: 'nodejs' };

export function middleware(request: NextRequest) {
  const failure = checkMutationOrigin({
    method: request.method,
    url: request.url,
    headers: request.headers,
    allowedHosts: allowedHostsFromEnv(),
  });
  if (!failure) return NextResponse.next();
  // Regra 6: só motivo e método; nunca URL, headers ou corpo.
  logger.warn('api mutation rejected', { reason: failure.reason, method: request.method });
  return guardErrorResponse(failure);
}
