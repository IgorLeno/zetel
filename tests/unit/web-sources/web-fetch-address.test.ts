import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPublicAddress, WebFetchError } from '@/lib/web-fetch';

describe('isPublicAddress (SPEC-012 RNF1)', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '127.255.255.255',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.10',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
  ])('bloqueia IPv4 não público %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '11.0.0.1'])(
    'aceita IPv4 público %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each([
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::192.168.0.1',
    '::127.0.0.1',
    '2001:db8::1',
    '3fff::1',
    '3fff:fff::1',
    '2001::1',
    '2002:c0a8:101::1',
    '100::1',
  ])('bloqueia IPv6 não público %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['2606:4700:4700::1111', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '64:ff9b::8.8.8.8'])(
    'aceita IPv6 público %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each(['', 'localhost', 'example.com', '1.2.3', '999.1.1.1', 'gggg::1'])('recusa entrada que não é IP: %s', (v) => {
    expect(isPublicAddress(v)).toBe(false);
  });
});

describe('assertPublicUrl (SPEC-012 RNF1)', () => {
  it('aceita http e https nas portas padrão, 80 e 443', () => {
    expect(assertPublicUrl('https://pt.wikipedia.org/wiki/Fourier').hostname).toBe('pt.wikipedia.org');
    expect(assertPublicUrl('http://example.com/').protocol).toBe('http:');
    expect(assertPublicUrl('http://example.com:443/x').port).toBe('443');
    expect(assertPublicUrl('https://example.com:80/x').port).toBe('80');
  });

  it.each([
    'ftp://example.com/a',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,oi',
    'gopher://example.com',
    'https://example.com:8080/',
    'http://example.com:22/',
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'não é url',
    '',
    'https://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://10.1.2.3/',
  ])('recusa %s', (raw) => {
    expect(() => assertPublicUrl(raw)).toThrow(WebFetchError);
  });

  it('a mensagem de erro não ecoa a URL', () => {
    try {
      assertPublicUrl('https://segredo:senha@interno.example.com:8080/caminho');
      throw new Error('deveria falhar');
    } catch (err) {
      expect(err).toBeInstanceOf(WebFetchError);
      expect((err as Error).message).not.toMatch(/segredo|interno|caminho|8080/);
    }
  });
});
