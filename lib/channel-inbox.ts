/**
 * Caixa de entrada do canal do curador (SPEC-018 RF2/RNF4): lê
 * `<channel_dir>/inbox/<slug>/`, aplica os limites e valida cada relatório com
 * `parseReport`. Sem rede, sem escrita e sem logs; quem chama conta e loga.
 *
 * O conteúdo do canal vem de um repositório externo e é tratado como hostil:
 * `inbox/` e `inbox/<slug>/` precisam ser diretórios reais (sem symlink), e
 * cada arquivo é aberto com `O_NOFOLLOW` e conferido no próprio descritor
 * (arquivo regular, sem hard link, dentro do limite) antes de ler um byte.
 * Nomes só passam por regex fechada, então nenhum caminho vem do relatório.
 */
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  IMAGE_NAME_RE,
  MAX_REPORT_BYTES,
  MAX_REPORT_IMAGES,
  parseReport,
  type ReportParseResult,
  type ReportRejectReason,
} from './report-format';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Teto de relatórios lidos por importação: cada parse de 1 MB custa segundos de event loop. */
export const MAX_INBOX_REPORTS = 200;

/** Nome de relatório no canal: minúsculas, dígitos e hífens (`AAAA-MM-DD-assunto.md`). */
const REPORT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,119}\.md$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type FileRejectReason = 'symlink' | 'not_regular_file' | 'too_large' | 'missing';

export type InboxInvalidReason =
  | 'unsafe_dir'
  | 'symlink'
  | 'not_regular_file'
  | 'bad_name'
  | 'too_large'
  | 'not_utf8'
  | 'slug_mismatch'
  | 'too_many_reports'
  | ReportRejectReason;

export type ImageLoadFailure =
  | 'unsafe_dir'
  | 'bad_name'
  | 'too_many_images'
  | 'missing_image'
  | 'symlink'
  | 'not_regular_file'
  | 'too_large'
  | 'bad_image';

export interface InboxReport {
  /** Nome do arquivo em `inbox/<slug>/`. */
  fileName: string;
  /** Caminho relativo ao clone, POSIX (`inbox/<slug>/<arquivo>`): parte da identidade (D6). */
  channelPath: string;
  /** sha256 dos bytes do relatório no canal. */
  contentHash: string;
  markdown: string;
  parsed: Extract<ReportParseResult, { ok: true }>;
}

export interface InboxScan {
  reports: InboxReport[];
  /** Um motivo por entrada recusada; o chamador só registra a contagem. */
  invalid: InboxInvalidReason[];
  /** Relatórios cujo `(caminho, hash)` o chamador já conhece: pulados sem parse. */
  known: number;
}

/** Diz se `(channelPath, contentHash)` já foi importado; consultado antes do parse. */
export type KnownReport = (channelPath: string, contentHash: string) => boolean;

export interface InboxImage {
  name: string;
  bytes: Buffer;
}

export type ImageLoadResult = { ok: true; images: InboxImage[] } | { ok: false; reason: ImageLoadFailure };

class UnsafeInboxDir extends Error {}

class FileRejected extends Error {
  constructor(readonly reason: FileRejectReason) {
    super(reason);
  }
}

/**
 * `inbox/<slug>/` como caminho real, ou `null` se ainda não existe. Qualquer
 * componente que seja symlink ou não seja diretório torna a pasta insegura.
 */
function zetelInboxDir(channelDir: string, slug: string): string | null {
  if (!SLUG_RE.test(slug)) throw new Error('Slug inválido.');
  const inbox = join(realpathSync(channelDir), 'inbox');
  const dir = join(inbox, slug);
  for (const path of [inbox, dir]) {
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new UnsafeInboxDir();
  }
  if (realpathSync(dir) !== dir) throw new UnsafeInboxDir();
  return dir;
}

/**
 * Lê no máximo `maxBytes` sem seguir symlink. `O_NONBLOCK` evita travar num
 * FIFO; tipo, hard link e tamanho são conferidos no descritor já aberto, então
 * trocar o arquivo depois da listagem não muda o que é lido.
 */
function readBounded(path: string, maxBytes: number): Buffer {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new FileRejected('symlink');
    if (code === 'ENOENT') throw new FileRejected('missing');
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new FileRejected('not_regular_file');
    if (stat.size > maxBytes) throw new FileRejected('too_large');
    // Lê até um byte além do limite: arquivo que cresceu após o fstat é recusado.
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > maxBytes) throw new FileRejected('too_large');
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Lista e valida os relatórios de `inbox/<slug>/`, em ordem de nome. O hash
 * vem antes do parse: relatório já conhecido (`isKnown`) é contado em `known`
 * sem passar pelo remark. Acima de `MAX_INBOX_REPORTS` lidos, o resto é
 * recusado.
 */
export function scanZetelInbox(channelDir: string, slug: string, isKnown: KnownReport = () => false): InboxScan {
  let dir: string | null;
  try {
    dir = zetelInboxDir(channelDir, slug);
  } catch (error) {
    if (error instanceof UnsafeInboxDir) return { reports: [], invalid: ['unsafe_dir'], known: 0 };
    throw error;
  }
  const scan: InboxScan = { reports: [], invalid: [], known: 0 };
  let read = 0;
  if (!dir) return scan;

  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.')) continue; // .gitkeep, .DS_Store
    if (entry.isSymbolicLink()) {
      scan.invalid.push('symlink');
      continue;
    }
    if (!entry.isFile()) {
      scan.invalid.push('not_regular_file');
      continue;
    }
    if (IMAGE_NAME_RE.test(name)) continue; // imagem: lida só quando um relatório a declara
    if (!REPORT_NAME_RE.test(name)) {
      scan.invalid.push('bad_name');
      continue;
    }
    if (read >= MAX_INBOX_REPORTS) {
      scan.invalid.push('too_many_reports');
      continue;
    }
    read += 1;
    const result = readReport(dir, name, slug, isKnown);
    if (result === 'known') scan.known += 1;
    else if ('reason' in result) scan.invalid.push(result.reason);
    else scan.reports.push(result);
  }
  return scan;
}

function readReport(
  dir: string,
  fileName: string,
  slug: string,
  isKnown: KnownReport,
): InboxReport | 'known' | { reason: InboxInvalidReason } {
  let bytes: Buffer;
  try {
    bytes = readBounded(join(dir, fileName), MAX_REPORT_BYTES);
  } catch (error) {
    if (!(error instanceof FileRejected)) throw error;
    // Sumir entre a listagem e a abertura equivale a não ser arquivo regular.
    return { reason: error.reason === 'missing' ? 'not_regular_file' : error.reason };
  }

  const channelPath = `inbox/${slug}/${fileName}`;
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  if (isKnown(channelPath, contentHash)) return 'known';

  let markdown: string;
  try {
    markdown = UTF8.decode(bytes);
  } catch {
    return { reason: 'not_utf8' };
  }

  const parsed = parseReport(markdown);
  if (!parsed.ok) return { reason: parsed.reason };
  if (parsed.meta.zetel !== slug) return { reason: 'slug_mismatch' };

  return { fileName, channelPath, contentHash, markdown, parsed };
}

/** Tipo real pelos magic bytes, no vocabulário das extensões aceitas (D3). SVG nunca passa. */
export function detectImageType(bytes: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }
  return null;
}

/**
 * Carrega as imagens declaradas por um relatório. Recusa o conjunto inteiro na
 * primeira falha: o relatório só entra com todas as imagens válidas.
 */
export function loadReportImages(channelDir: string, slug: string, names: readonly string[]): ImageLoadResult {
  if (names.length > MAX_REPORT_IMAGES) return { ok: false, reason: 'too_many_images' };
  if (!names.every((name) => IMAGE_NAME_RE.test(name))) return { ok: false, reason: 'bad_name' };
  if (names.length === 0) return { ok: true, images: [] };

  let dir: string | null;
  try {
    dir = zetelInboxDir(channelDir, slug);
  } catch (error) {
    if (error instanceof UnsafeInboxDir) return { ok: false, reason: 'unsafe_dir' };
    throw error;
  }
  if (!dir) return { ok: false, reason: 'missing_image' };

  const images: InboxImage[] = [];
  for (const name of names) {
    let bytes: Buffer;
    try {
      bytes = readBounded(join(dir, name), MAX_IMAGE_BYTES);
    } catch (error) {
      if (!(error instanceof FileRejected)) throw error;
      return { ok: false, reason: error.reason === 'missing' ? 'missing_image' : error.reason };
    }
    if (detectImageType(bytes) !== name.slice(name.lastIndexOf('.') + 1)) return { ok: false, reason: 'bad_image' };
    images.push({ name, bytes });
  }
  return { ok: true, images };
}
