import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from './zetel-service';
import { logger } from './logger';

/**
 * Serviço de memória global cooperativa (Módulo 7).
 *
 * Fonte de verdade é o **filesystem** — sem tabela SQLite. Cada memória é um
 * `.md` em `parceiro/memoria/` do vault, com frontmatter de §13.4. A memória é
 * **global** (escopo de qualquer Zetel), por isso não vive sob `zetels/<slug>/`.
 *
 * Regra #5: a leitura é sob demanda (sem cache de processo) — quem injeta no
 * contexto chama estas funções a cada turno.
 * Regra #6: nada de título/corpo/slug nos logs — apenas contagens e o Zetel de origem.
 */

const MEMORY_REL_DIR = 'parceiro/memoria';

export interface SaveMemoryInput {
  titulo: string;
  corpo: string;
  /** slug do Zetel de onde veio a sugestão, ou null se manual/global. */
  zetelOrigem: string | null;
  modelo: string | null;
}

export interface SavedMemory {
  slug: string;
  /** Caminho relativo ao vault (para Obsidian URI e reveal). */
  path: string;
}

export interface MemoryEntry {
  slug: string;
  titulo: string;
  corpo: string;
  origem: string | null;
  zetelOrigem: string | null;
  criadaEm: string | null;
  atualizadaEm: string | null;
  /** Caminho relativo ao vault. */
  relPath: string;
  /** Caminho absoluto (para copiar para o clipboard — D14). */
  absPath: string;
  /** Tamanho do arquivo em bytes (para aviso de "memória longa"). */
  bytes: number;
}

function memoryDir(vaultPath: string): string {
  return join(vaultPath, MEMORY_REL_DIR);
}

/** Frontmatter padrão das memórias (§13.4). */
function buildFrontmatter(opts: {
  origem: string;
  zetelOrigem: string | null;
  modelo: string | null;
  criadaEm: string;
  atualizadaEm: string;
}): string {
  return [
    '---',
    'escopo: global',
    `origem: ${opts.origem}`,
    `zetel_origem: ${opts.zetelOrigem ?? 'null'}`,
    `modelo: ${opts.modelo ?? 'null'}`,
    `criada_em: ${opts.criadaEm}`,
    `atualizada_em: ${opts.atualizadaEm}`,
    '---',
  ].join('\n');
}

/** Nome de arquivo livre dentro de `dir`: `<base>.md`, `<base>-2.md`… até -99. */
function resolveFreeName(dir: string, base: string): string {
  if (!existsSync(join(dir, `${base}.md`))) return `${base}.md`;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}.md`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error('Não foi possível gerar um nome de arquivo livre para a memória (até -99).');
}

/**
 * Salva a memória no vault. `origem` = 'sugerida' quando vem do chat (zetelOrigem
 * presente) e 'manual' caso contrário. Retorna slug do arquivo e caminho relativo.
 */
export function saveMemory(vaultPath: string, input: SaveMemoryInput): SavedMemory {
  const titulo = input.titulo.trim();
  const corpo = input.corpo.trim();
  if (!titulo) throw new Error('A memória precisa de um título.');
  if (!corpo) throw new Error('A memória precisa de um corpo.');

  const dir = memoryDir(vaultPath);
  mkdirSync(dir, { recursive: true });

  const base = slugify(titulo);
  const filename = resolveFreeName(dir, base);
  const now = new Date().toISOString();

  const frontmatter = buildFrontmatter({
    origem: input.zetelOrigem ? 'sugerida' : 'manual',
    zetelOrigem: input.zetelOrigem,
    modelo: input.modelo,
    criadaEm: now,
    atualizadaEm: now,
  });
  const fileContent = `${frontmatter}\n\n# ${titulo}\n\n${corpo}\n`;

  writeFileSync(join(dir, filename), fileContent);

  const slug = filename.replace(/\.md$/, '');
  const relPath = `${MEMORY_REL_DIR}/${filename}`;
  // Regra #6: sem título/corpo/slug no log — só o Zetel de origem e o tamanho do slug.
  logger.info('memory saved', { zetelOrigem: input.zetelOrigem ?? 'none', slug_len: slug.length });
  return { slug, path: relPath };
}

/** Parser de linha do frontmatter (§13.4 — escalares planos, sem YAML aninhado). */
function parseFrontmatter(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return out;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const eq = line.indexOf(':');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Primeiro heading `# ` do corpo (após o frontmatter), ou null. */
function firstHeading(content: string): string | null {
  const lines = content.split('\n');
  let inFront = false;
  let frontClosed = false;
  for (const line of lines) {
    const t = line.trim();
    if (!frontClosed) {
      if (t === '---') {
        if (!inFront) inFront = true;
        else frontClosed = true;
        continue;
      }
      if (!inFront) frontClosed = true; // sem frontmatter
    }
    const m = /^#\s+(.+)$/.exec(t);
    if (m) return m[1].trim();
  }
  return null;
}

/** Corpo da memória: tudo após o frontmatter e o H1 do título. */
function extractBody(content: string): string {
  const lines = content.split('\n');
  let i = 0;
  // pular frontmatter
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++; // pula o fechamento '---'
  }
  // pular linhas em branco e o primeiro H1
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i].trim())) i++;
  return lines.slice(i).join('\n').trim();
}

function nullable(v: string | undefined): string | null {
  return v && v !== 'null' ? v : null;
}

function readEntry(dir: string, name: string): MemoryEntry | null {
  const absPath = join(dir, name);
  let content = '';
  let bytes = 0;
  try {
    content = readFileSync(absPath, 'utf8');
    bytes = Buffer.byteLength(content, 'utf8');
  } catch {
    return null;
  }
  const fm = parseFrontmatter(content);
  const titulo = firstHeading(content) ?? name.replace(/\.md$/, '');
  return {
    slug: name.replace(/\.md$/, ''),
    titulo,
    corpo: extractBody(content),
    origem: nullable(fm.origem),
    zetelOrigem: nullable(fm.zetel_origem),
    criadaEm: fm.criada_em ?? null,
    atualizadaEm: fm.atualizada_em ?? null,
    relPath: `${MEMORY_REL_DIR}/${name}`,
    absPath,
    bytes,
  };
}

/** Lista as memórias globais, mais recentes primeiro (por `criada_em`). */
export function listMemories(vaultPath: string): MemoryEntry[] {
  const dir = memoryDir(vaultPath);
  if (!existsSync(dir)) return [];
  const items: MemoryEntry[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const e = readEntry(dir, entry.name);
    if (e) items.push(e);
  }
  return items.sort((a, b) => (b.criadaEm ?? '').localeCompare(a.criadaEm ?? ''));
}

/** Títulos existentes — injetados no prompt para evitar duplicatas. */
export function listMemoryTitles(vaultPath: string): string[] {
  return listMemories(vaultPath).map((m) => m.titulo);
}

/**
 * Entradas de memória (título + corpo + bytes), mais recentes primeiro. Sem
 * truncagem aqui — a truncagem a 40% do orçamento é responsabilidade de
 * `chat-prompt.ts`, que corta por arquivo inteiro.
 */
export function readAllMemoriesContent(
  vaultPath: string,
): { slug: string; titulo: string; corpo: string; criadaEm: string | null; bytes: number }[] {
  return listMemories(vaultPath).map((m) => ({
    slug: m.slug,
    titulo: m.titulo,
    corpo: m.corpo,
    criadaEm: m.criadaEm,
    bytes: m.bytes,
  }));
}

const PLACEHOLDER_MARKER = '<!-- Conteúdo a definir';

/**
 * Garante que `config/prompts/sugestao-memoria.md` tenha a rubrica real.
 * Só escreve se o arquivo está ausente OU ainda contém o placeholder — nunca
 * sobrescreve edição do usuário (D10: prompts vivem no vault). Espelha
 * `ensureSugestaoNotaPrompt`.
 */
export function ensureSugestaoMemoriaPrompt(vaultPath: string): string {
  const dir = join(vaultPath, 'config', 'prompts');
  const file = join(dir, 'sugestao-memoria.md');
  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8');
    if (!current.includes(PLACEHOLDER_MARKER)) return current;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, SUGESTAO_MEMORIA_PROMPT);
  logger.info('sugestao-memoria prompt ensured');
  return SUGESTAO_MEMORIA_PROMPT;
}

/** Rubrica de sugestão de memória (§11). Sentinelas próprias, distintas das notas. */
export const SUGESTAO_MEMORIA_PROMPT = `# Rubrica de sugestão de memória

Você é um parceiro de estudos. Ao longo da conversa, identifique formulações
relevantes que merecem ser lembradas em **sessões futuras com qualquer Zetel**.

Memória global é diferente de nota: não é sobre o conteúdo do material;
é sobre preferências do usuário, padrões de raciocínio, conexões que o usuário
fez entre conceitos de domínios diferentes, ou informações de contexto pessoal
que o usuário revelou explicitamente.

## Critérios para propor memória
- O usuário revelou uma preferência de aprendizado, estilo ou abordagem.
- O usuário estabeleceu uma conexão cross-domínio (ex.: conceito de física aplicado à filosofia).
- O usuário corrigiu um entendimento recorrente — algo que vale lembrar no futuro.
- A formulação tem valor de retomada em qualquer contexto futuro, não apenas neste Zetel.

## Anti-padrões — NÃO propor memória para
- Fatos sobre o material (esses viram notas, não memória).
- Perguntas pontuais de clarificação.
- Turnos sem substância sobre preferências ou conexões.
- Conteúdo já presente em \`parceiro/memoria/\` (verifique a lista de títulos).
- Mais de uma memória por turno.
- Turnos consecutivos (não propor em dois turnos seguidos).

## Como sinalizar uma sugestão

Responda normalmente em PT-BR. Se — e somente se — decidir propor uma memória,
acrescente ao FINAL da resposta um bloco delimitado EXATAMENTE assim:

<<<MEMORIA_SUGERIDA>>>
{"titulo":"...","corpo":"...","justificativa":"..."}
<<<FIM_MEMORIA>>>

Regras do bloco:
- JSON válido em uma linha; \`corpo\` conciso (até 2 parágrafos), em Markdown;
- \`justificativa\` é interna (o usuário nunca a vê — explique nela por que vale lembrar);
- se não for propor memória, NÃO inclua o bloco.
`;
