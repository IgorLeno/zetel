import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nodeTransport,
  safeFetch,
  WebFetchError,
  type Resolver,
  type Transport,
  type TransportRequest,
} from '@/lib/web-fetch';

/** Sem rede real: o resolver e o transport são falsos e registram o que receberam. */
interface FakeRoute {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | string | (() => AsyncIterable<Buffer>);
}

function fakeNet(dns: Record<string, string[]>, routes: Record<string, FakeRoute>) {
  const requests: TransportRequest[] = [];
  const resolver: Resolver = async (host) => {
    const ips = dns[host];
    if (!ips) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  const transport: Transport = async (req) => {
    requests.push(req);
    const route = routes[req.url.href];
    if (!route) return { status: 404, headers: {}, body: Readable.from([]) };
    const raw = route.body ?? '';
    const body = typeof raw === 'function' ? raw() : Readable.from([Buffer.from(raw)]);
    return { status: route.status ?? 200, headers: route.headers ?? {}, body };
  };
  return { resolver, transport, requests };
}

const HTML = { 'content-type': 'text/html; charset=utf-8' };

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(WebFetchError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('safeFetch (SPEC-012 RNF1/RNF2)', () => {
  it('conecta no IP validado, sem cookies, com User-Agent fixo', async () => {
    const net = fakeNet(
      { 'site.example': ['93.184.216.34'] },
      { 'https://site.example/a': { headers: HTML, body: '<p>oi</p>' } },
    );
    const res = await safeFetch('https://site.example/a', net);
    expect(res.kind).toBe('html');
    expect(res.charset).toBe('utf-8');
    expect(res.body.toString()).toBe('<p>oi</p>');
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.address).toBe('93.184.216.34');
    expect(net.requests[0]!.family).toBe(4);
    expect(net.requests[0]!.headers['user-agent']).toBe('Zetel/0.1');
    expect(Object.keys(net.requests[0]!.headers).map((h) => h.toLowerCase())).not.toContain('cookie');
  });

  it('bloqueia host cujo DNS devolve qualquer IP privado (todos os endereços são checados)', async () => {
    const net = fakeNet({ 'misto.example': ['93.184.216.34', '10.0.0.5'] }, {});
    await expectCode(safeFetch('https://misto.example/', net), 'blocked_host');
    expect(net.requests).toHaveLength(0);
  });

  it('bloqueia metadata de nuvem e loopback via DNS', async () => {
    const net = fakeNet({ 'meta.example': ['169.254.169.254'], 'lo.example': ['::1'] }, {});
    await expectCode(safeFetch('http://meta.example/latest', net), 'blocked_host');
    await expectCode(safeFetch('http://lo.example/', net), 'blocked_host');
    expect(net.requests).toHaveLength(0);
  });

  it('DNS sem resposta vira erro dns', async () => {
    const net = fakeNet({}, {});
    await expectCode(safeFetch('https://nao-existe.example/', net), 'dns');
  });

  it('segue redirect revalidando o destino e reporta a URL final', async () => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'], 'b.example': ['93.184.216.35'] },
      {
        'https://a.example/x': { status: 301, headers: { location: 'https://b.example/y' } },
        'https://b.example/y': { status: 302, headers: { location: '/z' } },
        'https://b.example/z': { headers: HTML, body: '<p>fim</p>' },
      },
    );
    const res = await safeFetch('https://a.example/x', net);
    expect(res.url.href).toBe('https://b.example/z');
    expect(net.requests.map((r) => r.address)).toEqual(['93.184.216.34', '93.184.216.35', '93.184.216.35']);
  });

  it('redirect para IP privado é bloqueado antes de conectar', async () => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'], 'interno.example': ['192.168.0.10'] },
      {
        'https://a.example/x': { status: 302, headers: { location: 'http://interno.example/admin' } },
        'https://a.example/y': { status: 307, headers: { location: 'http://127.0.0.1/' } },
        'https://a.example/w': { status: 308, headers: { location: 'file:///etc/passwd' } },
      },
    );
    await expectCode(safeFetch('https://a.example/x', net), 'blocked_host');
    await expectCode(safeFetch('https://a.example/y', net), 'blocked_host');
    await expectCode(safeFetch('https://a.example/w', net), 'invalid_url');
    expect(net.requests.map((r) => r.url.hostname)).toEqual(['a.example', 'a.example', 'a.example']);
  });

  it('mais de 5 redirects falha', async () => {
    const routes: Record<string, FakeRoute> = {};
    for (let i = 0; i < 7; i++) {
      routes[`https://a.example/${i}`] = { status: 302, headers: { location: `/${i + 1}` } };
    }
    const net = fakeNet({ 'a.example': ['93.184.216.34'] }, routes);
    await expectCode(safeFetch('https://a.example/0', net), 'too_many_redirects');
    expect(net.requests).toHaveLength(6);
  });

  it('exatamente 5 redirects ainda funciona', async () => {
    const routes: Record<string, FakeRoute> = {};
    for (let i = 0; i < 5; i++) {
      routes[`https://a.example/${i}`] = { status: 302, headers: { location: `/${i + 1}` } };
    }
    routes['https://a.example/5'] = { headers: HTML, body: '<p>ok</p>' };
    const net = fakeNet({ 'a.example': ['93.184.216.34'] }, routes);
    await expect(safeFetch('https://a.example/0', net)).resolves.toMatchObject({ kind: 'html' });
  });

  it.each([401, 402, 403, 407, 451])('%i vira "não acessível publicamente"', async (status) => {
    const net = fakeNet({ 'a.example': ['93.184.216.34'] }, { 'https://a.example/': { status, headers: HTML } });
    await expectCode(safeFetch('https://a.example/', net), 'not_public');
  });

  it.each([404, 500, 503])('%i vira http_status', async (status) => {
    const net = fakeNet({ 'a.example': ['93.184.216.34'] }, { 'https://a.example/': { status, headers: HTML } });
    await expectCode(safeFetch('https://a.example/', net), 'http_status');
  });

  it.each(['image/png', 'application/octet-stream', 'application/javascript', 'text/css', ''])(
    'recusa content-type %s',
    async (ct) => {
      const net = fakeNet(
        { 'a.example': ['93.184.216.34'] },
        { 'https://a.example/': { headers: ct ? { 'content-type': ct } : {}, body: 'x' } },
      );
      await expectCode(safeFetch('https://a.example/', net), 'bad_type');
    },
  );

  it.each([
    ['application/xhtml+xml', 'html'],
    ['text/plain; charset=iso-8859-1', 'text'],
    ['text/markdown', 'markdown'],
    ['application/pdf', 'pdf'],
  ])('aceita %s como %s', async (ct, kind) => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      { 'https://a.example/': { headers: { 'content-type': ct }, body: 'x' } },
    );
    await expect(safeFetch('https://a.example/', net)).resolves.toMatchObject({ kind });
  });

  it('descomprime gzip, deflate e br', async () => {
    const text = '<p>conteúdo comprimido</p>';
    for (const [enc, data] of [
      ['gzip', gzipSync(text)],
      ['deflate', deflateSync(text)],
      ['br', brotliCompressSync(text)],
    ] as const) {
      const net = fakeNet(
        { 'a.example': ['93.184.216.34'] },
        { 'https://a.example/': { headers: { ...HTML, 'content-encoding': enc }, body: data } },
      );
      const res = await safeFetch('https://a.example/', net);
      expect(res.body.toString('utf8')).toBe(text);
    }
  });

  it('recusa content-encoding desconhecido', async () => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      { 'https://a.example/': { headers: { ...HTML, 'content-encoding': 'zstd' }, body: 'x' } },
    );
    await expectCode(safeFetch('https://a.example/', net), 'bad_type');
  });

  it('limita HTML após descompressão (zip bomb)', async () => {
    const bomb = gzipSync(Buffer.alloc(6 * 1024 * 1024, 0x61));
    expect(bomb.length).toBeLessThan(100 * 1024);
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      { 'https://a.example/': { headers: { ...HTML, 'content-encoding': 'gzip' }, body: bomb } },
    );
    await expectCode(safeFetch('https://a.example/', net), 'too_large');
  });

  it('limita corpo sem compressão e respeita limites configurados por tipo', async () => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      {
        'https://a.example/h': { headers: HTML, body: Buffer.alloc(2048, 0x61) },
        'https://a.example/p': { headers: { 'content-type': 'application/pdf' }, body: Buffer.alloc(2048, 0x61) },
      },
    );
    await expectCode(safeFetch('https://a.example/h', { ...net, maxHtmlBytes: 1024 }), 'too_large');
    await expect(safeFetch('https://a.example/p', { ...net, maxHtmlBytes: 1024 })).resolves.toMatchObject({
      kind: 'pdf',
    });
    await expectCode(safeFetch('https://a.example/p', { ...net, maxPdfBytes: 1024 }), 'too_large');
  });

  it('recusa cedo por Content-Length acima do limite', async () => {
    let pulled = false;
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      {
        'https://a.example/': {
          headers: { ...HTML, 'content-length': String(6 * 1024 * 1024) },
          body: () =>
            (async function* () {
              pulled = true;
              yield Buffer.from('x');
            })(),
        },
      },
    );
    await expectCode(safeFetch('https://a.example/', net), 'too_large');
    expect(pulled).toBe(false);
  });

  it('aborta por timeout total', async () => {
    const net = fakeNet({ 'a.example': ['93.184.216.34'] }, {});
    const hanging: Transport = (req) =>
      new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expectCode(safeFetch('https://a.example/', { ...net, transport: hanging, timeoutMs: 50 }), 'timeout');
  });

  it('aborta por timeout enquanto o corpo ainda chega', async () => {
    const net = fakeNet(
      { 'a.example': ['93.184.216.34'] },
      {
        'https://a.example/': {
          headers: HTML,
          body: () =>
            (async function* () {
              yield Buffer.from('<p>');
              await new Promise((r) => setTimeout(r, 500));
              yield Buffer.from('</p>');
            })(),
        },
      },
    );
    await expectCode(safeFetch('https://a.example/', { ...net, timeoutMs: 50 }), 'timeout');
  });

  it('erros não ecoam URL nem host', async () => {
    const net = fakeNet({ 'segredo.example': ['10.0.0.1'] }, {});
    try {
      await safeFetch('https://segredo.example/caminho-privado', net);
      throw new Error('deveria falhar');
    } catch (err) {
      expect((err as Error).message).not.toMatch(/segredo|caminho-privado|10\.0\.0\.1/);
    }
  });
});

describe('nodeTransport — conexão fixada no IP validado', () => {
  let server: Server | null = null;

  afterEach(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    server = null;
  });

  it('conecta no endereço informado (sem nova resolução) e preserva o Host original', async () => {
    let seen: IncomingHttpHeaders | null = null;
    server = createServer((req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('pinned');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;

    // Host inexistente: se houvesse resolução DNS, a conexão falharia.
    const res = await nodeTransport({
      url: new URL(`http://host-que-nao-existe.invalid:${port}/p`),
      address: '127.0.0.1',
      family: 4,
      headers: { 'user-agent': 'Zetel/0.1' },
      signal: new AbortController().signal,
    });
    const chunks: Buffer[] = [];
    for await (const c of res.body) chunks.push(Buffer.from(c));
    expect(res.status).toBe(200);
    expect(Buffer.concat(chunks).toString()).toBe('pinned');
    expect(seen!.host).toBe(`host-que-nao-existe.invalid:${port}`);
    expect(seen!['user-agent']).toBe('Zetel/0.1');
  });
});
