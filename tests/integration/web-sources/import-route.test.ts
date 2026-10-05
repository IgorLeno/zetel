import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPages, processPdfFiles, processZetel } from '@/lib/ingestao-service';
import type { Resolver, Transport } from '@/lib/web-fetch';
import { createZetel, trashZetel } from '@/lib/zetel-service';
import { threePagePdf } from '@/tests/helpers/pdf-fixture';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({
  env: null as TempEnv | null,
  vault: true,
  routes: {} as Record<string, { status?: number; headers?: Record<string, string>; body?: Buffer | string }>,
  dns: {} as Record<string, string[]>,
}));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn((key: string) => (key === 'vault_path' && state.vault ? state.env!.vaultPath : null)),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Sem rede real: o safeFetch verdadeiro roda com resolver/transport falsos.
vi.mock('@/lib/web-fetch', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/web-fetch')>();
  const resolver: Resolver = async (host) => {
    const ips = state.dns[host];
    if (!ips) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    return ips.map((address) => ({ address, family: 4 }));
  };
  const transport: Transport = async (req) => {
    const r = state.routes[req.url.href];
    if (!r) return { status: 404, headers: {}, body: Readable.from([]) };
    return { status: r.status ?? 200, headers: r.headers ?? {}, body: Readable.from([Buffer.from(r.body ?? '')]) };
  };
  return {
    ...real,
    safeFetch: (url: string, opts: Parameters<typeof real.safeFetch>[1] = {}) =>
      real.safeFetch(url, { ...opts, resolver, transport }),
  };
});

const { logger } = await import('@/lib/logger');
const { POST } = await import('@/app/api/zetels/[id]/web-sources/import/route');
const { GET: listFilesRoute } = await import('@/app/api/zetels/[id]/files/route');

const LONG = 'A série de Fourier representa funções periódicas como somas de senos e cossenos. '.repeat(5);
const ARTICLE = `<html><head><title>Série de Fourier</title><script>steal()</script></head>
<body><nav>menu secreto</nav><main><h1>Série de Fourier</h1><p>${LONG}</p>
<h2>Convergência</h2><p>${LONG}</p><img src="https://img.example/x.png"></main></body></html>`;

function post(zetelId: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/zetels/${zetelId}/web-sources/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: zetelId }) },
  );
}

function allLogText(): string {
  const calls = Object.values(logger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls);
  return JSON.stringify(calls);
}

describe('POST /api/zetels/[id]/web-sources/import { urls } (SPEC-012 tarefa 001)', () => {
  let zetelId: string;
  let slug: string;

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    state.vault = true;
    state.dns = { 'wiki.example': ['93.184.216.34'], 'docs.example': ['93.184.216.35'], 'intra.example': ['10.0.0.7'] };
    state.routes = {
      'https://wiki.example/fourier': { headers: { 'content-type': 'text/html; charset=utf-8' }, body: ARTICLE },
      'https://docs.example/livro.pdf': { headers: { 'content-type': 'application/pdf' }, body: threePagePdf() },
      'https://wiki.example/spa': {
        headers: { 'content-type': 'text/html' },
        body: '<html><body><div id="root"></div></body></html>',
      },
      'https://wiki.example/pago': { status: 402, headers: { 'content-type': 'text/html' } },
      'https://wiki.example/falso.pdf': { headers: { 'content-type': 'application/pdf' }, body: 'não sou pdf' },
      'https://wiki.example/readme.md': {
        headers: { 'content-type': 'text/markdown' },
        body: `---\nx: 1\n---\n# Leia-me\n\n![img](https://img.example/a.png)\n<img src="https://img.example/b.png">\n\n${LONG}`,
      },
      'https://wiki.example/c1': {
        headers: { 'content-type': 'text/html' },
        body: `<title>A\u0085B\u2028C\uFEFFD</title><main><p>${LONG}</p></main>`,
      },
      'https://wiki.example/notas.txt': {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: `${LONG}\n\n# não é título\n${LONG}`,
      },
    };
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Fourier');
    zetelId = zetel.id;
    slug = zetel.slug;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    state.env = null;
  });

  it('importa HTML como snapshot .md com frontmatter de proveniência', async () => {
    const res = await post(zetelId, { urls: ['https://wiki.example/fourier'] });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'ok', extraction: 'full' });
    const file = results[0].file;
    expect(file.filename).toBe('web-serie-de-fourier.md');
    expect(file.sourceUrl).toBe('https://wiki.example/fourier');
    expect(file.sourceTitle).toBe('Série de Fourier');
    expect(Date.parse(file.sourceAccessedAt)).not.toBeNaN();

    const md = readFileSync(join(state.env!.vaultPath, 'zetels', slug, 'arquivos', file.filename), 'utf8');
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('source_url: "https://wiki.example/fourier"');
    expect(md).toContain('source_title: "Série de Fourier"');
    expect(md).toContain('source_site: "wiki.example"');
    expect(md).toMatch(/accessed_at: "\d{4}-\d{2}-\d{2}T[^"]+Z"/);
    expect(md).toContain('extraction: full\n---\n# Série de Fourier\n');
    expect(md.match(/^# Série de Fourier$/gm)).toHaveLength(1);
    expect(md).toContain('## Convergência');
    expect(md).not.toMatch(/steal|menu secreto|img\.example/);

    // O snapshot segue o pipeline Markdown atual e gera zetel_pages sem o frontmatter.
    const r = processZetel(state.env!.db, state.env!.vaultPath, zetelId);
    expect(r.pagesCount).toBeGreaterThanOrEqual(1);
    const pages = listPages(state.env!.db, zetelId);
    expect(pages[0]!.contentText).toContain('Série de Fourier');
    expect(pages.map((p) => p.contentText).join(' ')).not.toContain('source_url');
  });

  it('GET .../files expõe a proveniência', async () => {
    await post(zetelId, { urls: ['https://wiki.example/fourier'] });
    const res = await listFilesRoute(new Request('http://localhost'), { params: Promise.resolve({ id: zetelId }) });
    const { files } = await res.json();
    expect(files[0]).toMatchObject({
      sourceUrl: 'https://wiki.example/fourier',
      sourceTitle: 'Série de Fourier',
    });
  });

  it('importa PDF público como .pdf e Processar gera pdf_pages', async () => {
    const res = await post(zetelId, { urls: ['https://docs.example/livro.pdf'] });
    const { results } = await res.json();
    expect(results[0]).toMatchObject({ status: 'ok', extraction: 'pdf' });
    expect(results[0].file.filename).toBe('web-livro.pdf');
    expect(results[0].file.sourceUrl).toBe('https://docs.example/livro.pdf');
    expect(results[0].file.sourceTitle).toBe('livro.pdf');

    const pdf = await processPdfFiles(state.env!.db, state.env!.vaultPath, zetelId);
    expect(pdf.pagesCount).toBe(3);
    const n = state.env!.db.prepare('SELECT COUNT(*) AS n FROM pdf_pages').get() as { n: number };
    expect(n.n).toBe(3);
  });

  it('importa text/plain escapando Markdown', async () => {
    const res = await post(zetelId, { urls: ['https://wiki.example/notas.txt'] });
    const { results } = await res.json();
    expect(results[0]).toMatchObject({ status: 'ok', extraction: 'full' });
    const md = readFileSync(
      join(state.env!.vaultPath, 'zetels', slug, 'arquivos', results[0].file.filename),
      'utf8',
    );
    expect(md).toContain('\\# não é título');
  });

  it('text/markdown é gravado como texto escapado, sem imagem ou HTML ativos (review F002)', async () => {
    const res = await post(zetelId, { urls: ['https://wiki.example/readme.md'] });
    const { results } = await res.json();
    expect(results[0]).toMatchObject({ status: 'ok', extraction: 'full' });
    const md = readFileSync(
      join(state.env!.vaultPath, 'zetels', slug, 'arquivos', results[0].file.filename),
      'utf8',
    );
    expect(md).toContain('!\\[img\\](https://img.example/a.png)');
    expect(md).toContain('\\<img src="https://img.example/b.png"\\>');
    expect(md).not.toContain('x: 1');
    expect(md).not.toMatch(/(^|[^\\])!\[img\]/);
  });

  it('título sem controles C1, separadores de linha ou BOM (review F004)', async () => {
    const res = await post(zetelId, { urls: ['https://wiki.example/c1'] });
    const { results } = await res.json();
    expect(results[0].file.sourceTitle).toBe('A B C D');
  });

  it('devolve um resultado por URL, com erros genéricos sem eco da URL', async () => {
    const urls = [
      'https://wiki.example/fourier',
      'https://intra.example/admin',
      'https://wiki.example/spa',
      'https://wiki.example/pago',
      'https://wiki.example/falso.pdf',
    ];
    const res = await post(zetelId, { urls });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.map((r: { status: string }) => r.status)).toEqual(['ok', 'error', 'error', 'error', 'error']);
    expect(results[1].message).toMatch(/não é público/);
    expect(results[2].message).toMatch(/sem texto extraível/i);
    expect(results[3].message).toMatch(/não acessível publicamente/i);
    expect(results[4].message).toMatch(/PDF válido/);
    const text = JSON.stringify(results.slice(1));
    expect(text).not.toMatch(/intra|example|admin|spa|pago|falso/);

    const count = state.env!.db.prepare('SELECT COUNT(*) AS n FROM zetel_files').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('nomes repetidos não colidem', async () => {
    const res = await post(zetelId, { urls: ['https://wiki.example/fourier', 'https://wiki.example/fourier'] });
    const { results } = await res.json();
    expect(results.map((r: { file: { filename: string } }) => r.file.filename)).toEqual([
      'web-serie-de-fourier.md',
      'web-serie-de-fourier-2.md',
    ]);
  });

  it('logs só têm IDs, contagens e categorias — nunca URL, domínio, título ou conteúdo', async () => {
    await post(zetelId, {
      urls: ['https://wiki.example/fourier', 'https://intra.example/admin', 'https://wiki.example/pago'],
    });
    const logs = allLogText();
    expect(logs).toContain('blocked_host');
    expect(logs).toContain('not_public');
    for (const banned of ['wiki.example', 'intra.example', 'https://', 'Fourier', 'Série', 'fourier', 'admin', LONG.slice(0, 20)]) {
      expect(logs).not.toContain(banned);
    }
  });

  it.each([
    [{}],
    [{ urls: [] }],
    [{ urls: 'https://wiki.example/fourier' }],
    [{ urls: [1] }],
    [{ urls: Array.from({ length: 6 }, (_, i) => `https://wiki.example/${i}`) }],
    [{ urls: [`https://wiki.example/${'a'.repeat(2100)}`] }],
    ['não é json'],
  ])('400 para corpo inválido %#', async (body) => {
    const res = await post(zetelId, body);
    expect(res.status).toBe(400);
  });

  it('400 sem vault e para Zetel na lixeira, sem tocar a rede', async () => {
    state.vault = false;
    expect((await post(zetelId, { urls: ['https://wiki.example/fourier'] })).status).toBe(400);
    state.vault = true;
    trashZetel(state.env!.db, state.env!.vaultPath, zetelId);
    const res = await post(zetelId, { urls: ['https://wiki.example/fourier'] });
    expect(res.status).toBe(400);
  });
});
