/**
 * Formato do Relatório Zetel (SPEC-018, RF1/D3/RNF4): parse e validação
 * determinísticos, sem LLM, sem I/O e sem logs. O relatório é aceito inteiro
 * ou recusado inteiro com um motivo enumerado; nada é importado parcialmente.
 *
 * O Markdown é lido com o mesmo pipeline remark da ingestão (GFM + frontmatter
 * + math), para que blocos de código, títulos e imagens sejam reconhecidos
 * como na segmentação. O YAML do frontmatter é um subconjunto fechado (chaves
 * planas, escalares e uma lista) lido aqui, sem dependência de YAML genérica:
 * o formato é pequeno e tudo fora dele deve ser recusado, não interpretado.
 */
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import type { Definition, Heading, Root, RootContent } from 'mdast';

export const REPORT_FORMAT_VERSION = 1;
export const MAX_REPORT_BYTES = 1024 * 1024;
export const MAX_REPORT_IMAGES = 20;
export const MAX_REPORT_TITLE_CHARS = 200;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_CHARS = 60;
const IMAGE_NAME_RE = /^[a-z0-9-]+\.(?:png|jpg|webp)$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Esquema de URL (`https:`, `data:`, …) ou URL relativa a protocolo (`//host`). */
const EXTERNAL_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const EMPTY_SECTION_MARKER = 'Nenhum.';
/**
 * HTML bruto tolerado: só `<br>` e comentários bem-formados. Ambos são
 * removidos e o que sobrar precisa ser espaço; assim nada escondido entre dois
 * comentários (`<!-- --><img …><!-- -->`) passa. Comentário com `<` ou `>`
 * dentro é recusado: o HTML5 também fecha comentário em `<!-->`, `<!--->` e
 * `--!>`, o que exporia o que vem depois.
 */
const HARMLESS_HTML_PART_RE = /<br\s*\/?>|<!--[^<>]*-->/gi;
/** Embed do Obsidian: puxaria nota ou imagem arbitrária do vault após o import. */
const OBSIDIAN_EMBED_RE = /!\[\[/;

/** Seções D3 na ordem canônica: título exato `## …` → chave. */
export const REPORT_SECTIONS = [
  ['Resumo', 'resumo'],
  ['Tópicos', 'topicos'],
  ['Passo a passo', 'passoAPasso'],
  ['Conceitos', 'conceitos'],
  ['Dúvidas em aberto', 'duvidas'],
  ['Questões', 'questoes'],
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number][1];
export type ReportSections = Record<ReportSectionKey, string>;

export interface ReportMeta {
  version: typeof REPORT_FORMAT_VERSION;
  zetel: string;
  title: string;
  /** `AAAA-MM-DD`. */
  date: string;
  images: string[];
}

export type ReportRejectReason =
  | 'too_large'
  | 'missing_frontmatter'
  | 'invalid_frontmatter'
  | 'missing_field'
  | 'unsupported_version'
  | 'invalid_slug'
  | 'invalid_title'
  | 'invalid_date'
  | 'invalid_image_ref'
  | 'too_many_images'
  | 'external_image'
  | 'undeclared_image'
  | 'raw_html'
  | 'unknown_section'
  | 'duplicate_section'
  | 'section_out_of_order';

export type ReportParseResult =
  | {
      ok: true;
      meta: ReportMeta;
      /** Markdown de cada seção, sem o título e aparado; seção ausente = `''`. */
      sections: ReportSections;
      /** Nomes de imagem declarados no frontmatter (as referências do corpo são subconjunto). */
      imageRefs: string[];
    }
  | { ok: false; reason: ReportRejectReason };

class ReportRejected extends Error {
  constructor(readonly reason: ReportRejectReason) {
    super(reason);
  }
}

function reject(reason: ReportRejectReason): never {
  throw new ReportRejected(reason);
}

export function parseReport(markdown: string): ReportParseResult {
  try {
    return parseOrThrow(markdown);
  } catch (error) {
    if (error instanceof ReportRejected) return { ok: false, reason: error.reason };
    throw error;
  }
}

function parseOrThrow(markdown: string): ReportParseResult {
  // Limite antes de qualquer parse: o custo do remark cresce com a entrada.
  if (new TextEncoder().encode(markdown).byteLength > MAX_REPORT_BYTES) reject('too_large');

  const text = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const tree = remark()
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath)
    .parse(text) as Root;

  const [first, ...body] = tree.children;
  if (first?.type !== 'yaml') reject('missing_frontmatter');

  const meta = parseMeta(readYamlSubset(first.value));
  checkBodyImages(tree, new Set(meta.images));
  checkNoEmbeds(text, tree);
  const sections = splitSections(text, body, first.position?.end.offset ?? 0);
  return { ok: true, meta, sections, imageRefs: [...meta.images] };
}

// ---------------------------------------------------------------- frontmatter

type YamlValue = { kind: 'scalar'; value: string; quoted: boolean } | { kind: 'list'; items: string[] };

const ALLOWED_KEYS = new Set(['zetel_report', 'zetel', 'title', 'date', 'images']);
const KEY_LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*):(?:[ \t]+(.*))?$/;
const BLOCK_ITEM_RE = /^[ \t]*-[ \t]+(.*)$/;

/**
 * Subconjunto aceito: `chave: escalar`, `chave: [a, b]`, `chave:` seguido de
 * itens `  - a`, e comentários de linha inteira. Qualquer outra forma
 * (aninhamento, chave desconhecida ou repetida, aspas abertas) é inválida.
 */
function readYamlSubset(source: string): Map<string, YamlValue> {
  const entries = new Map<string, YamlValue>();
  const lines = source.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trimEnd();
    index += 1;
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const match = KEY_LINE_RE.exec(line);
    if (!match) reject('invalid_frontmatter');
    const [, key, rawValue = ''] = match;
    if (!ALLOWED_KEYS.has(key) || entries.has(key)) reject('invalid_frontmatter');

    const raw = rawValue.trim();
    if (raw !== '') {
      entries.set(key, raw.startsWith('[') ? { kind: 'list', items: parseFlowList(raw) } : parseScalar(raw));
      continue;
    }

    const items: string[] = [];
    while (index < lines.length) {
      const next = lines[index].trimEnd();
      if (next.trim() === '') {
        index += 1;
        continue;
      }
      const item = BLOCK_ITEM_RE.exec(next);
      if (!item) {
        if (/^[ \t]/.test(next)) reject('invalid_frontmatter');
        break;
      }
      items.push(scalarText(parseScalar(item[1].trim())));
      index += 1;
    }
    entries.set(key, items.length > 0 ? { kind: 'list', items } : { kind: 'scalar', value: '', quoted: false });
  }
  return entries;
}

function parseScalar(raw: string): YamlValue & { kind: 'scalar' } {
  if (raw.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\["\\])*)"$/.exec(raw);
    if (!match) reject('invalid_frontmatter');
    return { kind: 'scalar', value: match[1].replace(/\\(["\\])/g, '$1'), quoted: true };
  }
  if (raw.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'$/.exec(raw);
    if (!match) reject('invalid_frontmatter');
    return { kind: 'scalar', value: match[1].replace(/''/g, "'"), quoted: true };
  }
  if (/^[[\]{}&*!|>%@`]/.test(raw)) reject('invalid_frontmatter');
  return { kind: 'scalar', value: raw, quoted: false };
}

function parseFlowList(raw: string): string[] {
  if (!raw.endsWith(']')) reject('invalid_frontmatter');
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((part) => {
    const item = part.trim();
    if (item === '') reject('invalid_frontmatter');
    return scalarText(parseScalar(item));
  });
}

function scalarText(value: YamlValue): string {
  if (value.kind !== 'scalar') reject('invalid_frontmatter');
  return value.value;
}

function parseMeta(entries: Map<string, YamlValue>): ReportMeta {
  // Versão primeiro: um formato futuro pode ter outras chaves obrigatórias.
  const version = entries.get('zetel_report');
  if (!version) reject('missing_field');
  if (version.kind !== 'scalar' || version.quoted || version.value !== String(REPORT_FORMAT_VERSION)) {
    reject('unsupported_version');
  }

  const zetel = requiredScalar(entries, 'zetel');
  if (!SLUG_RE.test(zetel) || zetel.length > MAX_SLUG_CHARS) reject('invalid_slug');

  const title = requiredScalar(entries, 'title').trim();
  if (title === '' || title.length > MAX_REPORT_TITLE_CHARS) reject('invalid_title');

  const date = requiredScalar(entries, 'date');
  if (!isIsoCalendarDate(date)) reject('invalid_date');

  return { version: REPORT_FORMAT_VERSION, zetel, title, date, images: parseImageList(entries.get('images')) };
}

function requiredScalar(entries: Map<string, YamlValue>, key: string): string {
  const value = entries.get(key);
  if (!value) reject('missing_field');
  return scalarText(value);
}

function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseImageList(value: YamlValue | undefined): string[] {
  if (!value) return [];
  // `images:` sem itens equivale a lista vazia.
  if (value.kind === 'scalar') {
    if (value.value === '' && !value.quoted) return [];
    reject('invalid_frontmatter');
  }
  if (value.items.length > MAX_REPORT_IMAGES) reject('too_many_images');
  const seen = new Set<string>();
  for (const name of value.items) {
    if (!IMAGE_NAME_RE.test(name) || seen.has(name)) reject('invalid_image_ref');
    seen.add(name);
  }
  return value.items;
}

// ---------------------------------------------------------------- corpo

/**
 * Toda imagem do corpo precisa ser um nome local declarado em `images`.
 * Imagens dentro de blocos de código são texto e não entram aqui.
 */
function checkBodyImages(tree: Root, declared: Set<string>): void {
  // Todas as definições de um rótulo são checadas: com rótulo repetido, o
  // renderizador usa a primeira e o mdast poderia expor outra.
  const definitions = new Map<string, Definition[]>();
  visit(tree, 'definition', (node) => {
    definitions.set(node.identifier, [...(definitions.get(node.identifier) ?? []), node]);
  });

  visit(tree, (node) => {
    if (node.type === 'image') checkImageUrl(node.url, declared);
    if (node.type === 'imageReference') {
      for (const definition of definitions.get(node.identifier) ?? []) checkImageUrl(definition.url, declared);
    }
    // HTML bruto escapa da reescrita de links do import (D7) e pode carregar
    // recursos por vários atributos; só o inofensivo passa.
    if (node.type === 'html' && node.value.replace(HARMLESS_HTML_PART_RE, '').trim() !== '') reject('raw_html');
  });
}

/**
 * O Obsidian lê o texto-fonte, não o mdast: `![[x]]` vira embed mesmo quando o
 * remark o parte em nós (por exemplo, se existir a definição `[x]: …`). Por
 * isso a busca é no texto, mascarando só código, math e HTML já validado.
 */
function checkNoEmbeds(text: string, tree: Root): void {
  const masked = text.split('');
  visit(tree, (node) => {
    if (!['code', 'inlineCode', 'math', 'inlineMath', 'html'].includes(node.type)) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    for (let index = start; index < end; index += 1) masked[index] = ' ';
  });
  if (OBSIDIAN_EMBED_RE.test(masked.join(''))) reject('invalid_image_ref');
}

function checkImageUrl(url: string, declared: Set<string>): void {
  if (EXTERNAL_URL_RE.test(url)) reject('external_image');
  if (!IMAGE_NAME_RE.test(url)) reject('invalid_image_ref');
  if (!declared.has(url)) reject('undeclared_image');
}

function splitSections(text: string, body: RootContent[], bodyStart: number): ReportSections {
  const sectionKeys = new Map<string, ReportSectionKey>(REPORT_SECTIONS);
  const order = new Map<ReportSectionKey, number>(REPORT_SECTIONS.map(([, key], index) => [key, index]));

  const headings = body.filter((node): node is Heading => node.type === 'heading' && node.depth === 2);
  const sections = Object.fromEntries(REPORT_SECTIONS.map(([, key]) => [key, ''])) as ReportSections;

  const seen = new Set<ReportSectionKey>();
  let lastOrder = -1;
  headings.forEach((heading, index) => {
    const key = sectionKeys.get(headingText(heading).normalize('NFC').trim());
    if (!key) reject('unknown_section');
    if (seen.has(key)) reject('duplicate_section');
    const position = order.get(key) ?? -1;
    if (position < lastOrder) reject('section_out_of_order');
    seen.add(key);
    lastOrder = position;

    const start = heading.position?.end.offset ?? 0;
    const end = headings[index + 1]?.position?.start.offset ?? text.length;
    sections[key] = normalizeSection(text.slice(start, end));
  });

  // Texto fora de seção (antes do primeiro `##`) é parte do resumo.
  const preambleEnd = headings[0]?.position?.start.offset ?? text.length;
  const preamble = normalizeSection(text.slice(bodyStart, preambleEnd));
  sections.resumo = [preamble, sections.resumo].filter((part) => part !== '').join('\n\n');
  return sections;
}

function normalizeSection(raw: string): string {
  const trimmed = raw.trim();
  return trimmed === EMPTY_SECTION_MARKER ? '' : trimmed;
}

function headingText(node: Heading): string {
  let text = '';
  visit(node, (child) => {
    if (child.type === 'text' || child.type === 'inlineCode') text += child.value;
  });
  return text;
}
