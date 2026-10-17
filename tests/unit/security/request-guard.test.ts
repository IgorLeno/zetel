import { describe, expect, it } from 'vitest';
import {
  allowedHostsFromEnv,
  checkMutationOrigin,
  requireSameOriginJson,
} from '@/lib/request-guard';

const URL_LOCAL = 'http://localhost:3000/api/config';

function check(method: string, headers: Record<string, string>, allowedHosts?: string[]) {
  return checkMutationOrigin({ method, url: URL_LOCAL, headers: new Headers(headers), allowedHosts });
}

describe('checkMutationOrigin (SPEC-017 D3/D4)', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('%s passa mesmo cross-site', (method) => {
    expect(check(method, { host: 'evil.example', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBeNull();
  });

  it('mutação same-origin do próprio Zetel passa', () => {
    expect(check('POST', {
      host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin',
    })).toBeNull();
  });

  it('sem Origin e sem Sec-Fetch-Site passa (cliente não navegador)', () => {
    expect(check('PUT', { host: 'localhost:3000' })).toBeNull();
    expect(check('DELETE', {})).toBeNull();
  });

  it('Sec-Fetch-Site none passa', () => {
    expect(check('POST', { host: 'localhost:3000', 'sec-fetch-site': 'none' })).toBeNull();
  });

  it.each(['cross-site', 'same-site'])('Sec-Fetch-Site %s → 403', (site) => {
    expect(check('POST', { host: 'localhost:3000', 'sec-fetch-site': site }))
      .toEqual({ status: 403, reason: 'cross-site' });
  });

  it.each([
    ['outro site', 'https://evil.example'],
    ['outra porta no mesmo host', 'http://localhost:3001'],
    ['Origin null', 'null'],
    ['Origin malformado', 'not a url'],
  ])('Origin de %s → 403', (_label, origin) => {
    expect(check('PATCH', { host: 'localhost:3000', origin }))
      .toEqual({ status: 403, reason: 'origin-mismatch' });
  });

  it('Origin compara host sem diferenciar caixa', () => {
    expect(check('POST', { host: 'LOCALHOST:3000', origin: 'http://localhost:3000' })).toBeNull();
  });

  it.each(['127.0.0.1:3000', '[::1]:3000', 'localhost'])('host loopback %s passa', (host) => {
    expect(check('POST', { host, origin: `http://${host}` })).toBeNull();
  });

  it('DNS rebinding: Host fora da allowlist → 403 mesmo com Origin igual', () => {
    expect(check('POST', {
      host: 'evil.example:3000', origin: 'http://evil.example:3000', 'sec-fetch-site': 'same-origin',
    })).toEqual({ status: 403, reason: 'host-not-allowed' });
  });

  it('allowlist extra aceita host da LAN', () => {
    expect(check('POST', { host: '192.168.0.10:3000', origin: 'http://192.168.0.10:3000' }, ['192.168.0.10']))
      .toBeNull();
  });

  it('Host ausente usa o host da URL', () => {
    const failure = checkMutationOrigin({
      method: 'POST', url: 'http://evil.example/api/config', headers: new Headers(),
    });
    expect(failure).toEqual({ status: 403, reason: 'host-not-allowed' });
  });
});

describe('allowedHostsFromEnv', () => {
  it('lê lista por vírgula, normaliza caixa e ignora vazios', () => {
    expect(allowedHostsFromEnv(' Zetel.Local , ,192.168.0.10 ')).toEqual(['zetel.local', '192.168.0.10']);
    expect(allowedHostsFromEnv(undefined)).toEqual([]);
  });
});

describe('requireSameOriginJson', () => {
  function request(headers: Record<string, string>): Request {
    return new Request('http://localhost/api/config', { method: 'POST', headers, body: '{}' });
  }

  it('aceita JSON same-origin, com charset', () => {
    expect(requireSameOriginJson(request({ 'content-type': 'application/json; charset=utf-8' }))).toBeNull();
  });

  it.each([
    ['text/plain', { 'content-type': 'text/plain' }],
    ['form', { 'content-type': 'application/x-www-form-urlencoded' }],
    ['ausente', {}],
  ])('Content-Type %s → 415', async (_label, headers) => {
    const response = requireSameOriginJson(request(headers as Record<string, string>));
    expect(response?.status).toBe(415);
    expect(await response?.json()).toEqual({ error: 'Content-Type deve ser application/json.' });
  });

  it('cross-site → 403 antes do Content-Type', async () => {
    const response = requireSameOriginJson(request({ 'content-type': 'text/plain', origin: 'https://evil.example' }));
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: 'Origem da requisição não permitida.' });
  });
});
