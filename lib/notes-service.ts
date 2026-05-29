import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from './zetel-service';
import { logger } from './logger';

/**
 * Serviço de notas cooperativas (Módulo 6).
 *
 * Fonte de verdade é o **filesystem** (§13.5) — sem tabela SQLite de notas.
 * Cada nota é um `.md` em `notas-rapidas/` ou `notas-literatura/` do Zetel, com
 * frontmatter de §13.3. Nada de título/corpo nos logs (regra #6).
 */

export type NoteTipo = 'rapida' | 'literatura';

const NOTE_DIRS: Record<NoteTipo, string> = {
  rapida: 'notas-rapidas',
  literatura: 'notas-literatura',
};

export interface SaveNoteInput {
  tipo: NoteTipo;
  titulo: string;
  corpo: string;
  paginaOrigem: string | null;
  modelo: string;
}

export interface SavedNote {
  id: string;
  /** Caminho relativo ao vault (para Obsidian URI e reveal). */
  path: string;
}

export interface NoteListItem {
  tipo: NoteTipo;
  titulo: string;
  paginaOrigem: string | null;
  criadaEm: string | null;
  /** Caminho relativo ao vault. */
  relPath: string;
  /** Caminho absoluto (para copiar para o clipboard — D14). */
  absPath: string;
}

function zetelDir(vaultPath: string, slug: string, tipo: NoteTipo): string {
  return join(vaultPath, 'zetels', slug, NOTE_DIRS[tipo]);
}

/** Frontmatter padrão das notas (§13.3). */
function buildFrontmatter(opts: {
  slug: string;
  tipo: NoteTipo;
  modelo: string;
  paginaOrigem: string | null;
  criadaEm: string;
}): string {
  return [
    '---',
    `zetel: ${opts.slug}`,
    `tipo: ${opts.tipo}`,
    'origem: chat',
    `modelo: ${opts.modelo}`,
    `pagina_origem: ${opts.paginaOrigem ?? 'null'}`,
    `criada_em: ${opts.criadaEm}`,
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
  throw new Error('Não foi possível gerar um nome de arquivo livre para a nota (até -99).');
}

/** Salva a nota no vault. Retorna id (slug do arquivo) e caminho relativo. */
export function saveNote(vaultPath: string, slug: string, input: SaveNoteInput): SavedNote {
  const titulo = input.titulo.trim();
  const corpo = input.corpo.trim();
  if (!titulo) throw new Error('A nota precisa de um título.');
  if (!corpo) throw new Error('A nota precisa de um corpo.');

  const dir = zetelDir(vaultPath, slug, input.tipo);
  mkdirSync(dir, { recursive: true });

  const base = slugify(titulo);
  const filename = resolveFreeName(dir, base);
  const criadaEm = new Date().toISOString();

  const frontmatter = buildFrontmatter({
    slug,
    tipo: input.tipo,
    modelo: input.modelo,
    paginaOrigem: input.paginaOrigem,
    criadaEm,
  });
  const fileContent = `${frontmatter}\n\n# ${titulo}\n\n${corpo}\n`;

  writeFileSync(join(dir, filename), fileContent);

  const relPath = `zetels/${slug}/${NOTE_DIRS[input.tipo]}/${filename}`;
  // Sem filename/título no log: é derivado de texto do usuário (regra #6; mesma
  // política de `ingestao-service`). Só zetel slug + tipo.
  logger.info('note saved', { slug, tipo: input.tipo });
  return { id: filename.replace(/\.md$/, ''), path: relPath };
}

/** Parser de linha do frontmatter (§13.3 — escalares planos, sem YAML aninhado). */
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

function readDir(vaultPath: string, slug: string, tipo: NoteTipo): NoteListItem[] {
  const dir = zetelDir(vaultPath, slug, tipo);
  if (!existsSync(dir)) return [];
  const items: NoteListItem[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absPath = join(dir, entry.name);
    let content = '';
    try {
      content = readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    const titulo = firstHeading(content) ?? entry.name.replace(/\.md$/, '');
    const paginaOrigem = fm.pagina_origem && fm.pagina_origem !== 'null' ? fm.pagina_origem : null;
    items.push({
      tipo,
      titulo,
      paginaOrigem,
      criadaEm: fm.criada_em ?? null,
      relPath: `zetels/${slug}/${NOTE_DIRS[tipo]}/${entry.name}`,
      absPath,
    });
  }
  return items;
}

/** Lista as notas de um Zetel (ambos os tipos), mais recentes primeiro. */
export function listNotes(vaultPath: string, slug: string): NoteListItem[] {
  const all = [...readDir(vaultPath, slug, 'rapida'), ...readDir(vaultPath, slug, 'literatura')];
  return all.sort((a, b) => (b.criadaEm ?? '').localeCompare(a.criadaEm ?? ''));
}

/** Títulos existentes no Zetel — injetados no prompt para evitar duplicatas. */
export function listNoteTitles(vaultPath: string, slug: string): string[] {
  return listNotes(vaultPath, slug).map((n) => n.titulo);
}

const PLACEHOLDER_MARKER = '<!-- Conteúdo a definir';

/**
 * Garante que `config/prompts/sugestao-nota.md` tenha a rubrica real (§10.1).
 * Só escreve se o arquivo está ausente OU ainda contém o placeholder — nunca
 * sobrescreve edição do usuário (D10: prompts vivem no vault).
 */
export function ensureSugestaoNotaPrompt(vaultPath: string): string {
  const dir = join(vaultPath, 'config', 'prompts');
  const file = join(dir, 'sugestao-nota.md');
  if (existsSync(file)) {
    const current = readFileSync(file, 'utf8');
    if (!current.includes(PLACEHOLDER_MARKER)) return current;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, SUGESTAO_NOTA_PROMPT);
  logger.info('sugestao-nota prompt ensured');
  return SUGESTAO_NOTA_PROMPT;
}

/** Rubrica mínima de sugestão de nota (§10.1 do PRD). */
export const SUGESTAO_NOTA_PROMPT = `# Rubrica de sugestão de nota

Você é o parceiro de estudos do Zetel. Além de conversar, você PODE — com
parcimônia — propor uma nota quando o diálogo produz algo digno de retomada.

## Quando propor

**Nota rápida** — insight pontual, definição precisa, conexão direta entre
conceitos ou citação relevante (até 3 parágrafos). Proponha quando:
- o usuário acabou de articular um entendimento próprio sobre o trecho;
- o conceito tem valor de retomada futura;
- ainda não existe nota equivalente neste Zetel.

**Nota de literatura** — síntese mais elaborada de um trecho/conceito discutido
(título, resumo curto, contexto de origem). Proponha quando:
- a conversa cobriu um trecho substantivo (mais que uma frase pontual);
- o usuário sinalizou interesse profundo (perguntou várias vezes, pediu fixação);
- a síntese agrega entendimento em relação ao texto-fonte (não é cópia próxima).

## Quando NÃO propor (anti-padrões)

Não proponha nota para: cumprimentos, perguntas triviais, conteúdo já presente em
nota anterior deste Zetel, ou reformulações próximas demais do texto-fonte.

## Frequência

No máximo **uma** sugestão por turno. **Não** proponha em turnos consecutivos sem
nova substância na conversa.

## Como sinalizar uma sugestão

Responda normalmente em PT-BR. Se — e somente se — decidir propor uma nota,
acrescente ao FINAL da resposta um bloco delimitado EXATAMENTE assim:

<<<NOTA_SUGERIDA>>>
{"tipo":"rapida|literatura","titulo":"...","corpo":"...","pagina_origem":"<anchor ou null>","justificativa":"..."}
<<<FIM_NOTA>>>

Regras do bloco:
- JSON válido em uma linha; \`corpo\` em Markdown; \`justificativa\` é interna (o
  usuário nunca a vê — explique nela por que a nota vale a pena);
- use \`pagina_origem\` igual ao anchor da página em discussão, ou null;
- se não for propor nota, NÃO inclua o bloco.
`;
