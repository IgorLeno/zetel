import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable, type Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/**
 * Download seguro de fontes públicas da web (SPEC-012 RNF1/RNF2).
 *
 * Defesas contra SSRF e abuso:
 *  - só http(s), portas 80/443, sem userinfo;
 *  - o host é resolvido uma vez e TODOS os endereços precisam ser públicos;
 *  - a conexão usa o IP validado (`lookup` fixo), sem nova resolução — fecha a
 *    janela de DNS rebinding que o `fetch` global deixaria aberta;
 *  - redirects manuais (máx. 5), cada destino revalidado do zero;
 *  - timeout total e limites de corpo aplicados APÓS a descompressão;
 *  - sem cookies/credenciais; nada da página é executado.
 *
 * Regra #6: mensagens de erro são genéricas e nunca ecoam URL, host ou IP.
 */

export type WebFetchErrorCode =
  | 'invalid_url'
  | 'blocked_host'
  | 'dns'
  | 'timeout'
  | 'too_large'
  | 'bad_type'
  | 'not_public'
  | 'http_status'
  | 'too_many_redirects'
  | 'network';

const MESSAGES: Record<WebFetchErrorCode, string> = {
  invalid_url: 'Link inválido. Use um endereço http(s) público, sem porta especial.',
  blocked_host: 'Este endereço não é público e não pode ser importado.',
  dns: 'Não foi possível encontrar o site.',
  timeout: 'O site demorou demais para responder.',
  too_large: 'O conteúdo é grande demais para importar.',
  bad_type: 'Tipo de conteúdo não suportado (use página HTML, texto ou PDF).',
  not_public: 'Fonte não acessível publicamente.',
  http_status: 'O site respondeu com erro.',
  too_many_redirects: 'O link redireciona vezes demais.',
  network: 'Falha de rede ao baixar a fonte.',
};

export class WebFetchError extends Error {
  readonly code: WebFetchErrorCode;
  constructor(code: WebFetchErrorCode) {
    super(MESSAGES[code]);
    this.name = 'WebFetchError';
    this.code = code;
  }
}

export const USER_AGENT = 'Zetel/0.1';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 5;
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES_WEB = 50 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

function parseIPv4(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** Expande IPv6 (inclusive com IPv4 embutido e zona) em 8 grupos de 16 bits. */
function parseIPv6(raw: string): number[] | null {
  let ip = raw.split('%')[0]!;
  if (isIP(ip) !== 6) return null;
  // IPv4 embutido no final (`::ffff:1.2.3.4`) vira dois grupos hexadecimais.
  const v4Tail = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const n = parseIPv4(v4Tail[2]!);
    if (n === null) return null;
    ip = `${v4Tail[1]}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = ip.split('::');
  const groups = (s: string) => (s === '' ? [] : s.split(':').map((h) => parseInt(h, 16)));
  const left = groups(halves[0]!);
  if (halves.length === 1) return left.length === 8 ? left : null;
  const right = groups(halves[1]!);
  const fill = 8 - left.length - right.length;
  if (halves.length !== 2 || fill < 0) return null;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

/** Faixas IPv4 não públicas (base, bits de prefixo). */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "esta rede"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, inclui metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay (obsoleto)
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado + broadcast
];

const BLOCKED_V4_NUM = BLOCKED_V4.map(([base, bits]) => {
  const size = 2 ** (32 - bits);
  const start = parseIPv4(base)!;
  return [start, start + size - 1] as const;
});

function isPublicV4(n: number): boolean {
  return !BLOCKED_V4_NUM.some(([start, end]) => n >= start && n <= end);
}

/**
 * `true` somente para endereço IP unicast global. IPv6 público precisa estar em
 * 2000::/3 fora das faixas de documentação/túnel; IPv4-mapped e NAT64 são
 * avaliados pelo IPv4 embutido. Qualquer coisa que não seja IP → `false`.
 */
export function isPublicAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4 !== null) return isPublicV4(v4);

  const g = parseIPv6(ip);
  if (!g) return false;
  const embeddedV4 = g[6]! * 65536 + g[7]!;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // ::ffff:a.b.c.d (IPv4-mapped) e 64:ff9b::a.b.c.d (NAT64 bem conhecido).
  if (zeros(0, 5) && g[5] === 0xffff) return isPublicV4(embeddedV4);
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPublicV4(embeddedV4);

  if ((g[0]! & 0xe000) !== 0x2000) return false; // fora de 2000::/3: ::, ::1, ULA, link-local, multicast…
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentação
  if (g[0] === 0x3fff && g[1]! < 0x1000) return false; // documentação (3fff::/20)
  if (g[0] === 0x2001 && g[1]! < 0x0200) return false; // 2001::/23 (Teredo e afins)
  if (g[0] === 0x2002) return false; // 6to4
  return true;
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

function hostWithoutBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/** Valida esquema, porta e userinfo; IP literal precisa ser público. */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebFetchError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new WebFetchError('invalid_url');
  if (url.username || url.password) throw new WebFetchError('invalid_url');
  if (url.port && url.port !== '80' && url.port !== '443') throw new WebFetchError('invalid_url');
  const host = hostWithoutBrackets(url.hostname);
  if (!host) throw new WebFetchError('invalid_url');
  if (isIP(host) && !isPublicAddress(host)) throw new WebFetchError('blocked_host');
  return url;
}

// ---------------------------------------------------------------------------
// Transporte (injetável em testes)
// ---------------------------------------------------------------------------

export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface TransportRequest {
  url: URL;
  /** IP já validado; a conexão deve usar este endereço, sem resolver de novo. */
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array> & { destroy?: (err?: Error) => void };
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

const defaultResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** http/https nativos com `lookup` fixo no IP validado e sem pool de sockets. */
export const nodeTransport: Transport = ({ url, address, family, headers, signal }) =>
  new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    };
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, { method: 'GET', headers, lookup: pinned, agent: false, signal }, (res) => {
      resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res });
    });
    req.on('error', reject);
    req.end();
  });

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

export type WebContentKind = 'html' | 'text' | 'markdown' | 'pdf';

const ALLOWED_TYPES: Record<string, WebContentKind> = {
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'application/pdf': 'pdf',
};

export interface SafeFetchOptions {
  resolver?: Resolver;
  transport?: Transport;
  timeoutMs?: number;
  maxRedirects?: number;
  maxHtmlBytes?: number;
  maxPdfBytes?: number;
}

export interface SafeFetchResult {
  /** URL final, após redirects. */
  url: URL;
  kind: WebContentKind;
  charset: string | null;
  body: Buffer;
}

function header(headers: TransportResponse['headers'], name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function parseContentType(value: string | undefined): { mime: string; charset: string | null } {
  const [mime = '', ...params] = (value ?? '').split(';').map((s) => s.trim());
  const cs = params.find((p) => p.toLowerCase().startsWith('charset='));
  const charset = cs ? cs.slice(8).replace(/^"|"$/g, '').toLowerCase() || null : null;
  return { mime: mime.toLowerCase(), charset };
}

function decoderFor(encoding: string | undefined): Transform | null {
  const enc = (encoding ?? '').trim().toLowerCase();
  if (enc === '' || enc === 'identity') return null;
  if (enc === 'gzip' || enc === 'x-gzip') return createGunzip();
  if (enc === 'deflate') return createInflate();
  if (enc === 'br') return createBrotliDecompress();
  throw new WebFetchError('bad_type');
}

/** `dns.lookup` não aceita AbortSignal; a corrida garante o timeout total. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new WebFetchError('timeout'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new WebFetchError('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function resolvePublic(
  url: URL,
  resolver: Resolver,
  signal: AbortSignal,
): Promise<{ address: string; family: 4 | 6 }> {
  const host = hostWithoutBrackets(url.hostname);
  if (isIP(host)) return { address: host, family: isIP(host) as 4 | 6 };
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await abortable(resolver(host), signal);
  } catch (err) {
    if (err instanceof WebFetchError) throw err;
    throw new WebFetchError('dns');
  }
  if (addrs.length === 0) throw new WebFetchError('dns');
  if (!addrs.every((a) => isPublicAddress(a.address))) throw new WebFetchError('blocked_host');
  const first = addrs[0]!;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

async function readLimited(
  res: TransportResponse,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const decoder = decoderFor(header(res.headers, 'content-encoding'));
  const chunks: Buffer[] = [];
  let raw = 0;
  let total = 0;
  // Ao estourar o limite, o pipeline pode rejeitar com o erro secundário de um
  // stream destruído (ex.: gunzip); a flag preserva a causa real.
  let overLimit = false;
  const tooLarge = () => {
    overLimit = true;
    return new WebFetchError('too_large');
  };
  const source = Readable.from(
    (async function* () {
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk);
        raw += buf.length;
        if (raw > limit) throw tooLarge();
        yield buf;
      }
    })(),
  );
  const sink = async (stream: AsyncIterable<Buffer>) => {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > limit) throw tooLarge();
      chunks.push(chunk);
    }
  };
  try {
    if (decoder) await pipeline(source, decoder, sink, { signal });
    else await pipeline(source, sink, { signal });
  } catch (err) {
    if (overLimit) throw new WebFetchError('too_large');
    throw err;
  }
  return Buffer.concat(chunks);
}

/**
 * Baixa `rawUrl` com todas as guardas de RNF1/RNF2. Lança `WebFetchError` com
 * código categorizado (seguro para log) e mensagem genérica (segura para UI).
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const resolver = opts.resolver ?? defaultResolver;
  const transport = opts.transport ?? nodeTransport;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxHtml = opts.maxHtmlBytes ?? MAX_HTML_BYTES;
  const maxPdf = opts.maxPdfBytes ?? MAX_PDF_BYTES_WEB;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  timer.unref?.();

  let current: TransportResponse | null = null;
  try {
    let url = assertPublicUrl(rawUrl);
    for (let hop = 0; ; hop++) {
      const { address, family } = await resolvePublic(url, resolver, controller.signal);
      current = await transport({
        url,
        address,
        family,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain,text/markdown,application/pdf;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        },
        signal: controller.signal,
      });
      const { status } = current;

      if (status >= 300 && status < 400 && header(current.headers, 'location')) {
        current.body.destroy?.();
        if (hop >= maxRedirects) throw new WebFetchError('too_many_redirects');
        let next: string;
        try {
          next = new URL(header(current.headers, 'location')!, url).href;
        } catch {
          throw new WebFetchError('invalid_url');
        }
        url = assertPublicUrl(next);
        continue;
      }
      if ([401, 402, 403, 407, 451].includes(status)) throw new WebFetchError('not_public');
      if (status < 200 || status >= 300) throw new WebFetchError('http_status');

      const { mime, charset } = parseContentType(header(current.headers, 'content-type'));
      const kind = ALLOWED_TYPES[mime];
      if (!kind) throw new WebFetchError('bad_type');

      const limit = kind === 'pdf' ? maxPdf : maxHtml;
      const declared = Number(header(current.headers, 'content-length'));
      if (Number.isFinite(declared) && declared > limit) throw new WebFetchError('too_large');

      const body = await readLimited(current, limit, controller.signal);
      return { url, kind, charset, body };
    }
  } catch (err) {
    current?.body.destroy?.();
    if (err instanceof WebFetchError) throw err;
    if (controller.signal.aborted) throw new WebFetchError('timeout');
    throw new WebFetchError('network');
  } finally {
    clearTimeout(timer);
  }
}
