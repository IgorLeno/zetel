import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { ChatMessage, ConceptSuggestion } from '@/types/chat-message';
import { slugify } from './zetel-service';

export interface ConceptIndexEntry {
  slug: string;
  nome: string;
  aliases: string[];
}

export interface ConceptProvenance {
  zetel_id: string;
  session_id: string;
  message_id: string;
  source_id: string | null;
  file_id: string | null;
  filename: string | null;
  page: number | null;
  content_hash: string | null;
  selection_hash: string | null;
  selection: string | null;
  saved_at: string;
}

export function normalizeConceptName(value: string): string {
  return value.normalize('NFD').replace(/\p{Mn}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ').trim();
}

function conceptDir(vaultPath: string, zetelSlug: string): string {
  return join(vaultPath, 'zetels', zetelSlug, 'conceitos');
}

function scalar(value: string): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, ' ').trim());
}

/** Lê somente o cabeçalho plano criado por este serviço. */
export function parseConceptMarkdown(content: string, slug: string): ConceptIndexEntry | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  const read = (value: string | undefined): string => {
    if (!value) return '';
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'string' ? parsed : '';
    } catch { return value; }
  };
  const nome = read(fields.nome);
  if (!nome) return null;
  const aliases = read(fields.aliases).split(';').map((s) => s.trim()).filter(Boolean);
  return { slug, nome, aliases };
}

export function listConcepts(vaultPath: string, zetelSlug: string): ConceptIndexEntry[] {
  const dir = conceptDir(vaultPath, zetelSlug);
  if (!existsSync(dir)) return [];
  const result: ConceptIndexEntry[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.slice(0, -3);
    const parsed = parseConceptMarkdown(readFileSync(join(dir, entry.name), 'utf8'), slug);
    if (parsed) result.push(parsed);
  }
  return result;
}

export function findConcept(entries: ConceptIndexEntry[], name: string): ConceptIndexEntry | null {
  const key = normalizeConceptName(name);
  if (!key) return null;
  return entries.find((entry) => [entry.nome, ...entry.aliases]
    .some((candidate) => normalizeConceptName(candidate) === key)) ?? null;
}

export function relevantConceptNames(entries: ConceptIndexEntry[], query: string): string[] {
  const text = normalizeConceptName(query);
  return entries.filter((entry) => [entry.nome, ...entry.aliases].some((name) =>
    text.includes(normalizeConceptName(name))))
    .slice(0, 5).map((entry) => `${entry.nome}${entry.aliases.length ? ` (${entry.aliases.join(', ')})` : ''}`.slice(0, 300));
}

function quote(text: string): string {
  return text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split('\n').map((line) => `> ${line}`).join('\n');
}

export function renderConceptEntry(
  userFormulation: string | null,
  partnerFormulation: string,
  provenance: ConceptProvenance,
  sessionTitle: string | null,
): string {
  const label = [provenance.saved_at.slice(0, 10), sessionTitle && `Sessão ${sessionTitle}`,
    provenance.filename, provenance.page !== null && `p. ${provenance.page}`]
    .filter(Boolean).join(' · ').replace(/[\r\n#]/g, ' ');
  const prov = JSON.stringify(provenance).replace(/-->/g, '--\\u003e');
  return `\n### ${label}\n<!-- zetel:prov ${prov} -->\n\n` +
    (userFormulation ? `**Sua formulação:**\n${quote(userFormulation)}\n\n` : '') +
    `**Formulação da parceira:**\n${quote(partnerFormulation)}\n`;
}

export function renderConceptMarkdown(
  id: string,
  zetelSlug: string,
  name: string,
  aliases: string[],
  entry: string,
  now: string,
): string {
  return `---\nid: ${scalar(id)}\nnome: ${scalar(name)}\naliases: ${scalar(aliases.join('; '))}\n` +
    `zetel: ${scalar(zetelSlug)}\ncreated_at: ${now}\nupdated_at: ${now}\n---\n\n` +
    `# ${name.replace(/[\r\n#]/g, ' ').trim()}\n\n## Formulações\n${entry}`;
}

/** Resolve a origem exclusivamente pelo mapa e metadados gravados no turno. */
export function reconstructConceptProvenance(
  db: Database.Database,
  message: ChatMessage,
  suggestion: ConceptSuggestion,
  now: string,
): ConceptProvenance {
  const source = suggestion.sourceId ? message.meta?.sources?.[suggestion.sourceId] : null;
  if (suggestion.sourceId && !source) throw new Error('Fonte da sugestão indisponível.');
  const provenance: ConceptProvenance = {
    zetel_id: message.zetelId, session_id: message.sessionId, message_id: message.id,
    source_id: suggestion.sourceId, file_id: null, filename: null, page: null,
    content_hash: null, selection_hash: null, selection: null, saved_at: now,
  };
  if (!source?.fileId) return provenance;
  const row = db.prepare(
    `SELECT f.filename, p.content_hash, p.content_text FROM zetel_files f
     JOIN pdf_pages p ON p.file_id = f.id AND p.page_number = ?
     WHERE f.id = ? AND f.zetel_id = ?`,
  ).get(source.pageNumber, source.fileId, message.zetelId) as
    { filename: string; content_hash: string; content_text: string } | undefined;
  if (!row) throw new Error('Fonte original não encontrada neste Zetel.');
  if (!source.contentHash || source.contentHash !== row.content_hash)
    throw new Error('A fonte mudou desde a sugestão. Converse novamente antes de salvar.');
  provenance.file_id = source.fileId;
  provenance.filename = row.filename;
  provenance.page = source.pageNumber;
  provenance.content_hash = row.content_hash;
  if (source.type === 'selecao' && message.meta?.selectionVerified &&
    message.meta.focusFileId === source.fileId && message.meta.focusPageNumber === source.pageNumber &&
    Number.isInteger(message.meta.selectionStart) && Number.isInteger(message.meta.selectionEnd)) {
    const selected = row.content_text.slice(message.meta.selectionStart, message.meta.selectionEnd);
    const hash = createHash('sha256').update(selected).digest('hex');
    if (hash === message.meta.selectionHash) {
      provenance.selection = selected;
      provenance.selection_hash = hash;
    }
  }
  return provenance;
}

export function saveConcept(
  vaultPath: string,
  zetelSlug: string,
  input: { action: 'create' | 'append'; conceptSlug?: string; name: string; aliases: string[];
    userFormulation: string | null; partnerFormulation: string; provenance: ConceptProvenance;
    sessionTitle: string | null },
): { slug: string; action: 'create' | 'append' } {
  const dir = conceptDir(vaultPath, zetelSlug);
  mkdirSync(dir, { recursive: true });
  const entries = listConcepts(vaultPath, zetelSlug);
  const match = [input.name, ...input.aliases]
    .map((candidate) => findConcept(entries, candidate)).find((candidate) => candidate !== null) ?? null;
  const now = input.provenance.saved_at;
  const entry = renderConceptEntry(input.userFormulation, input.partnerFormulation,
    input.provenance, input.sessionTitle);
  if (input.action === 'create') {
    if (match) throw new Error('Conceito existente. Confirme a adição ao conceito atual.');
    const slug = slugify(input.name);
    const path = join(dir, `${slug}.md`);
    const content = renderConceptMarkdown(randomUUID(), zetelSlug, input.name, input.aliases, entry, now);
    try { writeFileSync(path, content, { flag: 'wx' }); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('Nome de arquivo já existe. Confirme a adição ou ajuste o nome.');
      throw err;
    }
    return { slug, action: 'create' };
  }
  if (!input.conceptSlug || !/^[a-z0-9-]{1,60}$/.test(input.conceptSlug))
    throw new Error('Conceito de destino inválido.');
  const target = entries.find((item) => item.slug === input.conceptSlug);
  if (!target || !match || match.slug !== target.slug)
    throw new Error('Conceito existente não corresponde à sugestão.');
  const path = join(dir, `${target.slug}.md`);
  if (!lstatSync(path).isFile()) throw new Error('Arquivo de conceito inválido.');
  const original = readFileSync(path, 'utf8');
  const updated = original.replace(/^updated_at: .*$/m, `updated_at: ${now}`) + entry;
  const temp = join(dir, `.${target.slug}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, updated, { flag: 'wx' });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
  return { slug: target.slug, action: 'append' };
}
