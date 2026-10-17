import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
}));

const { middleware, config } = await import('@/middleware');

afterEach(() => {
  warn.mockClear();
  vi.unstubAllEnvs();
});

function request(method: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/zetels/abc?x=1', { method, headers });
}

describe('middleware de mutação em /api (SPEC-017 D1)', () => {
  it('cobre somente /api', () => {
    expect(config.matcher).toBe('/api/:path*');
  });

  it('deixa passar mutação same-origin', () => {
    const response = middleware(request('DELETE', { host: 'localhost:3000', origin: 'http://localhost:3000' }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(warn).not.toHaveBeenCalled();
  });

  it('bloqueia cross-site com 403 e loga só motivo e método', async () => {
    const response = middleware(request('POST', {
      host: 'localhost:3000', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site',
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Origem da requisição não permitida.' });
    expect(warn).toHaveBeenCalledWith('api mutation rejected', { reason: 'cross-site', method: 'POST' });
  });

  it('usa ZETEL_ALLOWED_HOSTS em runtime', () => {
    const lan = { host: '192.168.0.10:3000', origin: 'http://192.168.0.10:3000' };
    expect(middleware(request('POST', lan)).status).toBe(403);
    vi.stubEnv('ZETEL_ALLOWED_HOSTS', '192.168.0.10');
    expect(middleware(request('POST', lan)).headers.get('x-middleware-next')).toBe('1');
  });
});
