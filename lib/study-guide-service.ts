import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { logger } from './logger';
import { getSetting } from './settings';
import { getOpenRouterModel } from './config';
import { readApiKey, requestJson, type RequestUsage } from './openrouter';
import {
  assertZetelAtivo,
  listPages,
  makeAnchorFactory,
  parseMarkdownForSegmentation,
  segmentFile,
} from './ingestao-service';
import { getZetelById, slugify } from './zetel-service';
import { zetelArquivosDir, zetelArtefatosDir } from './paths';
import {
  buildSourceIndex,
  catalogForPrompt,
  type IndexableFile,
  type SourceBlock,
  type SourceIndex,
} from './source-index';
import {
  DEFAULT_STUDY_GUIDE_MAX_TOKENS,
  DEFAULT_STUDY_GUIDE_TIMEOUT_S,
  STUDY_GUIDE_MAX_TOKENS_MAX,
  STUDY_GUIDE_MAX_TOKENS_MIN,
  STUDY_GUIDE_TIMEOUT_S_MAX,
  STUDY_GUIDE_TIMEOUT_S_MIN,
} from './study-guide-constants';

/**
 * Pipeline editorial do Guia de Estudo (Módulo 10D, D26/D27). Porta a estratégia
 * validada no Spike 10C para produção:
 *
 *   Markdown → catálogo de blocos com sha256 (injetado no prompt) → LLM gera SÓ JSON
 *   → validação de schema + rastreabilidade → template determinístico → HTML.
 *
 * Invariantes (CLAUDE.md):
 *  - R1/Regra #1: a LLM nunca gera HTML — só JSON. O HTML vem de `renderStudyGuideHtml`.
 *  - R2/Regra #2: `guia-estudo.html` é autocontido (CSS inline); o app não injeta CSS.
 *  - R3: catálogo construído com o parser de produção (`parseMarkdownForSegmentation`,
 *    `segmentFile`, `sha256`) — sem reparser próprio.
 *  - R4: `guia-estudo.source.json` é derivado server-side dos hashes VALIDADOS, nunca
 *    do que a LLM afirma.
 *  - R5: validação antes de gravar — schema fatal; hash órfão sinaliza item (não
 *    descarta em silêncio); `resposta_correta ∈ opcoes`.
 *  - Regra #6/DT4: logs só com contagens/ids — nunca conteúdo de usuário.
 */

export const GUIA_ESTUDO_FILENAME = 'guia-estudo.html';
export const GUIA_ESTUDO_META_FILENAME = 'guia-estudo.meta.json';
export const GUIA_ESTUDO_SOURCE_FILENAME = 'guia-estudo.source.json';

const DEFAULT_MAX_WORDS = 1000;

// ---------------------------------------------------------------------------
// Tipos do JSON gerado pela LLM (schema D26) — validados antes de qualquer uso.
// ---------------------------------------------------------------------------

interface TraceFields {
  guide_block_id?: string;
  source_headings?: unknown;
  source_file?: unknown;
  source_block_hashes?: unknown;
}
interface ResumoItem extends TraceFields {
  texto: string;
}
interface CardItem extends TraceFields {
  guide_block_id: string;
  titulo: string;
  conteudo: string;
}
interface SecaoItem extends TraceFields {
  guide_block_id: string;
  titulo: string;
  conteudo: string;
}
interface GlossarioItem extends TraceFields {
  guide_block_id: string;
  termo: string;
  definicao: string;
}
interface QuizItem extends TraceFields {
  guide_block_id: string;
  pergunta: string;
  opcoes: string[];
  resposta_correta: string;
  explicacao: string;
}
interface ZkItem extends TraceFields {
  guide_block_id: string;
  pergunta: string;
}

interface StudyGuide {
  titulo: string;
  subtitulo: string;
  resumo: ResumoItem;
  cards: CardItem[];
  secoes: SecaoItem[];
  glossario: GlossarioItem[];
  quiz: QuizItem[];
  perguntas_zettelkasten: ZkItem[];
}

const ITEM_COLLECTIONS = ['cards', 'secoes', 'glossario', 'quiz', 'perguntas_zettelkasten'] as const;

// ---------------------------------------------------------------------------
// Mapa de rastreabilidade derivado server-side (R4) e metadados.
// ---------------------------------------------------------------------------

export interface SourceMapEntry {
  source_file: string | null;
  source_files: string[];
  source_headings: string[];
  source_block_hashes: string[]; // apenas hashes VALIDADOS
  page_indices: number[];
  flagged?: true; // item sem nenhum hash válido (rastreabilidade ausente — R5)
}

export type StudyGuideSourceMap = Record<string, SourceMapEntry>;

export interface StudyGuideResult {
  model: string;
  outputPath: string;
  sizeBytes: number;
  counts: { cards: number; secoes: number; glossario: number; quiz: number; zettelkasten: number };
  tokens: RequestUsage | null;
  traceability: {
    totalItems: number;
    withValidHash: number;
    coveragePct: number;
    orphans: number;
    flaggedItems: number;
  };
  quizRemoved: number;
}

// ---------------------------------------------------------------------------
// Caminhos / leitura de artefatos
// ---------------------------------------------------------------------------

export function guiaEstudoHtmlPath(vaultPath: string, slug: string): string {
  return join(zetelArtefatosDir(vaultPath, slug), GUIA_ESTUDO_FILENAME);
}
function guiaEstudoMetaPath(vaultPath: string, slug: string): string {
  return join(zetelArtefatosDir(vaultPath, slug), GUIA_ESTUDO_META_FILENAME);
}
function guiaEstudoSourcePath(vaultPath: string, slug: string): string {
  return join(zetelArtefatosDir(vaultPath, slug), GUIA_ESTUDO_SOURCE_FILENAME);
}

export interface ResolvedStudyGuideArtifact {
  kind: 'guia-estudo';
  filename: typeof GUIA_ESTUDO_FILENAME;
  path: string;
}

/** Resolve o HTML do Guia de Estudo se existir. */
export function resolveStudyGuideArtifact(
  vaultPath: string,
  slug: string,
): ResolvedStudyGuideArtifact | null {
  const path = guiaEstudoHtmlPath(vaultPath, slug);
  if (!existsSync(path)) return null;
  return { kind: 'guia-estudo', filename: GUIA_ESTUDO_FILENAME, path };
}

export interface StudyGuideInfo {
  exists: boolean;
  metaExists: boolean;
  sourceExists: boolean;
  model: string | null;
  generatedAt: string | null;
  counts: StudyGuideResult['counts'] | null;
}

/** Metadados básicos do Guia de Estudo para `getArtifactsInfo` (sem ler o HTML). */
export function getStudyGuideInfo(vaultPath: string, slug: string): StudyGuideInfo {
  const htmlPath = guiaEstudoHtmlPath(vaultPath, slug);
  const metaPath = guiaEstudoMetaPath(vaultPath, slug);
  const sourcePath = guiaEstudoSourcePath(vaultPath, slug);

  const exists = existsSync(htmlPath);
  const metaExists = existsSync(metaPath);

  let model: string | null = null;
  let generatedAt: string | null = null;
  let counts: StudyGuideResult['counts'] | null = null;
  if (metaExists) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
        model?: string;
        generatedAt?: string;
        counts?: StudyGuideResult['counts'];
      };
      model = typeof meta.model === 'string' ? meta.model : null;
      generatedAt = typeof meta.generatedAt === 'string' ? meta.generatedAt : null;
      counts = meta.counts ?? null;
    } catch {
      // meta corrompido não deve quebrar a listagem de artefatos
    }
  }

  return {
    exists,
    metaExists,
    sourceExists: existsSync(sourcePath),
    model,
    generatedAt,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Carregamento dos arquivos segmentados (paritário com renderZetel) + catálogo
// ---------------------------------------------------------------------------

interface ZetelFileRow {
  filename: string;
}

/**
 * Segmenta os arquivos do Zetel como o pipeline determinístico, retornando o
 * Markdown bruto concatenado, os arquivos indexáveis (página → nós) e a contagem
 * de páginas. A paridade de parser/segmentação garante que `page_index` aqui bate
 * com `zetel_pages.page_index` (essencial para D27).
 */
function loadSegmentedFiles(
  db: Database.Database,
  vaultPath: string,
  slug: string,
  zetelId: string,
): { files: IndexableFile[]; fullMarkdown: string; pagesCount: number } {
  const fileRows = db
    .prepare('SELECT filename FROM zetel_files WHERE zetel_id = ? ORDER BY order_index ASC')
    .all(zetelId) as ZetelFileRow[];

  const dir = zetelArquivosDir(vaultPath, slug);
  const maxWords = Number(getSetting('max_words_per_page')) || DEFAULT_MAX_WORDS;
  const anchorOf = makeAnchorFactory(new Set<string>());

  const files: IndexableFile[] = [];
  const markdownParts: string[] = [];
  let globalIndex = 0;

  for (const row of fileRows) {
    const path = join(dir, row.filename);
    if (!existsSync(path)) {
      // Regra #6: sem filename na mensagem; a aba Arquivos já sinaliza o drift.
      throw new Error(
        'Um arquivo deste Zetel não foi encontrado em arquivos/ (pode ter sido removido fora do app). ' +
          'Verifique a aba Arquivos e reprocesse.',
      );
    }
    const content = readFileSync(path, 'utf8');
    markdownParts.push(`# Arquivo: ${row.filename}\n\n${content}`);

    const tree = parseMarkdownForSegmentation(content);
    const stem = slugify(basename(row.filename, extname(row.filename)));
    const pages = segmentFile(tree, stem, maxWords, globalIndex, anchorOf);
    files.push({
      sourceFile: row.filename,
      pages: pages.map((p, i) => ({ pageIndex: globalIndex + i, nodes: p.nodes })),
    });
    globalIndex += pages.length;
  }

  return { files, fullMarkdown: markdownParts.join('\n\n---\n\n'), pagesCount: globalIndex };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  catalog: ReturnType<typeof catalogForPrompt>,
  catalogOmitted = 0,
): string {
  const catalogNote =
    catalogOmitted > 0
      ? `\n\nAVISO: ${catalogOmitted} bloco(s) omitido(s) do catálogo por limite de tamanho do prompt. ` +
        `Use apenas os hashes listados abaixo em source_block_hashes.\n`
      : '';
  return `Você é um designer instrucional que transforma um documento técnico em Markdown
num GUIA DE ESTUDO didático, estruturado e rastreável. Responda em PT-BR.

REGRAS ABSOLUTAS:
- Responda APENAS com um objeto JSON válido. Sem texto fora do JSON, sem HTML, sem Markdown cercado.
- NUNCA invente fatos que não estejam no documento. O guia é editorial na FORMA, fiel no CONTEÚDO.
- RASTREABILIDADE OBRIGATÓRIA: cada item gerado deve apontar para os blocos de origem.
  Use EXCLUSIVAMENTE os "sha256" do CATÁLOGO DE BLOCOS abaixo em "source_block_hashes".
  NUNCA invente um hash; copie-os literalmente do catálogo. Cite 1 a 4 hashes por item.
  "source_file" deve ser o "source_file" do bloco citado; "source_headings" deve refletir
  o "heading_path" dos blocos citados.

SCHEMA EXATO (todos os campos são obrigatórios; arrays com pelo menos 1 item):
{
  "titulo": "string — título editorial do guia",
  "subtitulo": "string — subtítulo/promessa de aprendizado",
  "resumo": {
    "texto": "string — visão geral em 2-4 frases",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  },
  "cards": [{
    "guide_block_id": "string único, ex: card-1",
    "titulo": "string — conceito-chave", "conteudo": "string — explicação concisa (1-3 frases)",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  }],
  "secoes": [{
    "guide_block_id": "string único, ex: sec-1",
    "titulo": "string", "conteudo": "string — texto didático em parágrafos (pode ter \\n\\n)",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  }],
  "glossario": [{
    "guide_block_id": "string único, ex: glo-1",
    "termo": "string", "definicao": "string",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  }],
  "quiz": [{
    "guide_block_id": "string único, ex: quiz-1",
    "pergunta": "string", "opcoes": ["string", "string", "string", "string"],
    "resposta_correta": "string — DEVE ser idêntica a uma das opcoes", "explicacao": "string",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  }],
  "perguntas_zettelkasten": [{
    "guide_block_id": "string único, ex: zk-1",
    "pergunta": "string — pergunta aberta que conecta ideias e estimula reflexão",
    "source_headings": ["string"], "source_file": "string", "source_block_hashes": ["sha256"]
  }]
}

Gere de 3 a 6 cards, 3 a 5 seções, 4 a 8 termos de glossário, 3 a 6 perguntas de quiz e
3 a 5 perguntas Zettelkasten.

CATÁLOGO DE BLOCOS (sha256 → origem; use estes hashes em source_block_hashes):${catalogNote}
${JSON.stringify(catalog)}`;
}

function buildUserPrompt(markdown: string): string {
  return `Documento(s) de origem:\n\n---\n${markdown}\n---\n\nGere o guia de estudo em JSON conforme o schema.`;
}

// ---------------------------------------------------------------------------
// Parsing tolerante (R6) + validação (R5)
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Extrai JSON tolerando cerca ```json ... ``` (modelos sem json_object — R6). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function stringArray(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === 'string');
}

/**
 * Endurecimento de quiz (R5): remove itens cuja `resposta_correta` não está em `opcoes`.
 * Retorna os itens válidos e a contagem removida (logada como número — regra #6).
 */
function hardenQuiz(rawQuiz: unknown): { quiz: QuizItem[]; removed: number } {
  const items = asArray(rawQuiz);
  const quiz: QuizItem[] = [];
  let removed = 0;
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const opcoes = stringArray(it.opcoes);
    const resp = it.resposta_correta;
    if (
      isNonEmptyString(it.guide_block_id) &&
      isNonEmptyString(it.pergunta) &&
      opcoes.length >= 2 &&
      isNonEmptyString(resp) &&
      opcoes.includes(resp)
    ) {
      quiz.push({
        guide_block_id: it.guide_block_id as string,
        pergunta: it.pergunta as string,
        opcoes,
        resposta_correta: resp,
        explicacao: typeof it.explicacao === 'string' ? it.explicacao : '',
        source_headings: it.source_headings,
        source_file: it.source_file,
        source_block_hashes: it.source_block_hashes,
      });
    } else {
      removed++;
    }
  }
  return { quiz, removed };
}

/**
 * Valida e normaliza o JSON da LLM no `StudyGuide`. Lança em erro estrutural (campos
 * obrigatórios ausentes, coleção vazia) — nesse caso nada é gravado (R5). O quiz já
 * vem endurecido. A rastreabilidade é checada à parte (`computeTraceability`).
 */
function validateAndNormalize(raw: unknown, hardenedQuiz: QuizItem[]): StudyGuide {
  if (!raw || typeof raw !== 'object') {
    throw new Error('A resposta do modelo não é um objeto JSON.');
  }
  const g = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(g.titulo)) errors.push('titulo');
  if (!isNonEmptyString(g.subtitulo)) errors.push('subtitulo');

  const resumoRaw = g.resumo as Record<string, unknown> | undefined;
  if (!resumoRaw || !isNonEmptyString(resumoRaw.texto)) errors.push('resumo.texto');

  const cards = asArray(g.cards).filter(
    (x) => isNonEmptyString((x as CardItem).guide_block_id) && isNonEmptyString((x as CardItem).titulo),
  ) as CardItem[];
  const secoes = asArray(g.secoes).filter(
    (x) => isNonEmptyString((x as SecaoItem).guide_block_id) && isNonEmptyString((x as SecaoItem).titulo),
  ) as SecaoItem[];
  const glossario = asArray(g.glossario).filter(
    (x) =>
      isNonEmptyString((x as GlossarioItem).guide_block_id) &&
      isNonEmptyString((x as GlossarioItem).termo),
  ) as GlossarioItem[];
  const zk = asArray(g.perguntas_zettelkasten).filter(
    (x) => isNonEmptyString((x as ZkItem).guide_block_id) && isNonEmptyString((x as ZkItem).pergunta),
  ) as ZkItem[];

  if (cards.length === 0) errors.push('cards');
  if (secoes.length === 0) errors.push('secoes');
  if (glossario.length === 0) errors.push('glossario');
  if (hardenedQuiz.length === 0) errors.push('quiz');
  if (zk.length === 0) errors.push('perguntas_zettelkasten');

  if (errors.length > 0) {
    throw new Error(
      `O guia gerado está incompleto (campos ausentes ou vazios: ${errors.join(', ')}). Tente gerar novamente.`,
    );
  }

  return {
    titulo: g.titulo as string,
    subtitulo: g.subtitulo as string,
    resumo: {
      texto: (resumoRaw as Record<string, unknown>).texto as string,
      source_headings: (resumoRaw as Record<string, unknown>).source_headings,
      source_file: (resumoRaw as Record<string, unknown>).source_file,
      source_block_hashes: (resumoRaw as Record<string, unknown>).source_block_hashes,
    },
    cards,
    secoes,
    glossario,
    quiz: hardenedQuiz,
    perguntas_zettelkasten: zk,
  };
}

/** Todos os itens rastreáveis do guia, rotulados (resumo + coleções). */
function traceTargets(guia: StudyGuide): { label: string; id: string; item: TraceFields }[] {
  const targets: { label: string; id: string; item: TraceFields }[] = [
    { label: 'resumo', id: 'resumo', item: guia.resumo },
  ];
  for (const key of ITEM_COLLECTIONS) {
    const arr = guia[key] as (TraceFields & { guide_block_id: string })[];
    arr.forEach((item, i) =>
      targets.push({ label: `${key}[${i}]`, id: item.guide_block_id, item }),
    );
  }
  return targets;
}

interface Traceability {
  sourceMap: StudyGuideSourceMap;
  totalItems: number;
  withValidHash: number;
  coveragePct: number;
  orphans: number;
  flaggedItems: number;
}

/**
 * Constrói o `source.json` SERVER-SIDE a partir dos hashes validados (R4) e mede
 * cobertura/órfãos. Cada hash citado deve existir no catálogo (`byHash`); hashes
 * inexistentes contam como órfãos. Item com 0 hashes válidos é `flagged` (R5).
 */
function computeTraceability(guia: StudyGuide, index: SourceIndex): Traceability {
  const targets = traceTargets(guia);
  const sourceMap: StudyGuideSourceMap = {};
  let withValidHash = 0;
  let orphans = 0;
  let flaggedItems = 0;

  for (const { id, item } of targets) {
    const cited = stringArray(item.source_block_hashes);
    const validHashes: string[] = [];
    const sourceFiles = new Set<string>();
    const pageIndices = new Set<number>();
    let headings: string[] = [];

    for (const h of cited) {
      const blocks = index.byHash.get(h);
      if (!blocks || blocks.length === 0) {
        orphans++;
        continue;
      }
      validHashes.push(h);
      for (const b of blocks) {
        sourceFiles.add(b.source_file);
        pageIndices.add(b.page_index);
        if (headings.length === 0 && b.heading_path.length > 0) headings = [...b.heading_path];
      }
    }

    const entry: SourceMapEntry = {
      source_file: sourceFiles.size > 0 ? [...sourceFiles][0] : null,
      source_files: [...sourceFiles],
      source_headings: headings,
      source_block_hashes: validHashes,
      page_indices: [...pageIndices].sort((a, b) => a - b),
    };
    if (validHashes.length > 0) {
      withValidHash++;
    } else {
      entry.flagged = true;
      flaggedItems++;
    }
    sourceMap[id] = entry;
  }

  const coveragePct = targets.length === 0 ? 0 : (withValidHash / targets.length) * 100;
  return {
    sourceMap,
    totalItems: targets.length,
    withValidHash,
    coveragePct,
    orphans,
    flaggedItems,
  };
}

// ---------------------------------------------------------------------------
// Template determinístico (R1/R2: HTML do template, CSS inline, sem CDN)
// ---------------------------------------------------------------------------

function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto com quebras de parágrafo → <p>…</p> (escapado). */
function paragraphs(text: unknown): string {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Atributo data-page para o item (D27): página de origem derivada do source map. */
function pageAttr(id: string, sourceMap: StudyGuideSourceMap): string {
  const pg = sourceMap[id]?.page_indices?.[0];
  return typeof pg === 'number' ? ` data-page="${pg}"` : '';
}

/** Badge discreto de rastreabilidade (trilha de headings + nº de blocos válidos). */
function traceBadge(id: string, sourceMap: StudyGuideSourceMap): string {
  const entry = sourceMap[id];
  if (!entry) return '';
  if (entry.flagged) {
    return `<p class="trace trace-flag" title="Sem bloco de origem confirmado">↳ origem não confirmada</p>`;
  }
  const trail = entry.source_headings.length ? esc(entry.source_headings.join(' › ')) : '—';
  const n = entry.source_block_hashes.length;
  const title = entry.source_block_hashes.map(esc).join('\n');
  return `<p class="trace" title="${title}">↳ ${trail} · ${n} bloco(s) de origem</p>`;
}

function navLink(id: string, label: string): string {
  return `<a href="#${esc(id)}" data-nav-target="${esc(id)}">${esc(label)}</a>`;
}

function renderGuideNav(secoes: SecaoItem[]): string {
  const sectionLinks = secoes
    .map((s, i) => navLink(`secao-${i + 1}`, s.titulo))
    .join('\n');
  return `<aside class="guide-sidebar" aria-label="Navegação do guia">
    <nav class="guide-nav">
      ${navLink('capa', 'Capa')}
      ${navLink('conceitos-chave', 'Conceitos-chave')}
      ${sectionLinks}
      ${navLink('glossario', 'Glossário')}
      ${navLink('quiz', 'Quiz')}
      ${navLink('zettelkasten', 'Perguntas Zettelkasten')}
    </nav>
  </aside>`;
}

function renderCards(cards: CardItem[], sourceMap: StudyGuideSourceMap): string {
  const items = cards
    .map(
      (c) => `<div class="card"${pageAttr(c.guide_block_id, sourceMap)}>
      <h3>${esc(c.titulo)}</h3>
      <p>${esc(c.conteudo)}</p>
      ${traceBadge(c.guide_block_id, sourceMap)}
    </div>`,
    )
    .join('\n');
  return `<section id="conceitos-chave" data-nav-section="conceitos-chave"><h2>Conceitos-chave</h2><div class="card-grid">${items}</div></section>`;
}

function renderSecoes(secoes: SecaoItem[], sourceMap: StudyGuideSourceMap): string {
  const items = secoes
    .map(
      (s, i) => `<article id="secao-${i + 1}" class="secao" data-nav-section="secao-${i + 1}"${pageAttr(s.guide_block_id, sourceMap)}>
      <h3>${esc(s.titulo)}</h3>
      ${paragraphs(s.conteudo)}
      ${traceBadge(s.guide_block_id, sourceMap)}
    </article>`,
    )
    .join('\n');
  return `<section class="secoes"><h2>Seções</h2>${items}</section>`;
}

function renderGlossario(glossario: GlossarioItem[], sourceMap: StudyGuideSourceMap): string {
  const items = glossario
    .map(
      (g) => `<div class="termo"${pageAttr(g.guide_block_id, sourceMap)} data-search-text="${esc(
        `${g.termo} ${g.definicao}`.toLocaleLowerCase('pt-BR'),
      )}">
      <dt>${esc(g.termo)}</dt>
      <dd>${esc(g.definicao)} ${traceBadge(g.guide_block_id, sourceMap)}</dd>
    </div>`,
    )
    .join('\n');
  return `<section id="glossario" data-nav-section="glossario"><h2>Glossário</h2>
    <label class="glossary-search-label" for="glossary-search">Buscar no glossário</label>
    <input id="glossary-search" class="glossary-search" type="search" autocomplete="off" placeholder="Buscar termo ou definição">
    <dl id="glossary-list">${items}</dl>
  </section>`;
}

function renderQuiz(quiz: QuizItem[], sourceMap: StudyGuideSourceMap): string {
  const items = quiz
    .map((q, i) => {
      const correctIndex = Math.max(0, q.opcoes.findIndex((o) => o === q.resposta_correta));
      const opts = q.opcoes
        .map(
          (o, j) =>
            `<button type="button" class="quiz-option" data-option-index="${j}">${esc(o)}</button>`,
        )
        .join('\n');
      return `<div class="quiz-item" data-answer-index="${correctIndex}"${pageAttr(q.guide_block_id, sourceMap)}>
      <p class="quiz-q"><strong>${i + 1}.</strong> ${esc(q.pergunta)}</p>
      <div class="quiz-opts">${opts}</div>
      <p class="quiz-feedback" hidden></p>
      ${q.explicacao ? `<p class="quiz-exp" hidden>${esc(q.explicacao)}</p>` : ''}
      ${traceBadge(q.guide_block_id, sourceMap)}
    </div>`;
    })
    .join('\n');
  return `<section id="quiz" data-nav-section="quiz"><div class="quiz-head"><h2>Quiz</h2><div class="quiz-score" id="quiz-score">Pontuação: 0 / 0</div><button type="button" id="quiz-reset" class="quiz-reset">Reiniciar quiz</button></div>${items}</section>`;
}

function renderZettelkasten(perguntas: ZkItem[], sourceMap: StudyGuideSourceMap): string {
  const items = perguntas
    .map(
      (p) =>
        `<li${pageAttr(p.guide_block_id, sourceMap)}>${esc(p.pergunta)} ${traceBadge(p.guide_block_id, sourceMap)}</li>`,
    )
    .join('\n');
  return `<section id="zettelkasten" data-nav-section="zettelkasten"><h2>Perguntas Zettelkasten</h2><ul class="zk">${items}</ul></section>`;
}

const GUIDE_DARK_VARS = `--bg:#0d1117;--card:#161b22;--sub:#21262d;--border:rgba(255,255,255,.1);
  --text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--ok:#2ea043;--ok-bg:rgba(46,160,67,.12);
  --ok-fg:#7ee787;--bad:#f85149;--bad-bg:rgba(248,81,73,.13);--warn:#d29922;--shadow:rgba(0,0,0,.22);`;
const GUIDE_LIGHT_VARS = `--bg:#ffffff;--card:#f6f8fa;--sub:#eaeef2;--border:rgba(31,35,40,.12);
  --text:#1f2328;--muted:#57606a;--accent:#0969da;--ok:#1a7f37;--ok-bg:rgba(26,127,55,.10);
  --ok-fg:#1a7f37;--bad:#cf222e;--bad-bg:rgba(207,34,46,.10);--warn:#9a6700;--shadow:rgba(31,35,40,.10);`;

function guideCss(): string {
  return `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{${GUIDE_DARK_VARS}}
  [data-theme="dark"]{${GUIDE_DARK_VARS}}
  [data-theme="light"]{${GUIDE_LIGHT_VARS}}
  @media (prefers-color-scheme:light){:root:not([data-theme]){${GUIDE_LIGHT_VARS}}}
  html{scroll-behavior:smooth}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);
    color:var(--text);line-height:1.65;margin:0;padding:0}
  .guide-shell{display:grid;grid-template-columns:248px minmax(0,860px);gap:32px;max-width:1200px;
    margin:0 auto;padding:32px 24px 80px}
  .guide-sidebar{position:sticky;top:18px;align-self:start;max-height:calc(100vh - 36px);overflow:auto;
    border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 14px 34px var(--shadow)}
  .guide-nav{display:flex;flex-direction:column;padding:10px}
  .guide-nav a{display:block;color:var(--muted);text-decoration:none;border-radius:6px;padding:9px 10px;
    font-size:13px;line-height:1.35}
  .guide-nav a:hover,.guide-nav a:focus{color:var(--text);background:var(--sub);outline:none}
  .guide-nav a.is-active{color:var(--accent);background:var(--sub);font-weight:700}
  .guide-main{min-width:0}
  header.capa{text-align:center;padding:34px 0 42px;border-bottom:1px solid var(--border);margin-bottom:36px;
    scroll-margin-top:24px}
  .brand{display:inline-block;font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;
    color:var(--accent);margin-bottom:18px}
  header.capa h1{font-size:34px;line-height:1.15;margin-bottom:12px;font-weight:780}
  header.capa .sub{font-size:18px;color:var(--muted);margin-bottom:24px}
  header.capa .resumo{background:var(--card);border:1px solid var(--border);border-radius:8px;
    padding:18px 22px;text-align:left;font-size:15px;color:var(--text)}
  section,.secao{scroll-margin-top:24px}
  section{margin-bottom:40px}
  section>h2,.quiz-head h2{font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;
    color:var(--muted);margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid var(--border)}
  h3{font-size:18px;font-weight:680;margin-bottom:10px;color:var(--accent)}
  p{margin-bottom:12px}
  .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px}
  .card h3{font-size:15px}
  .secao{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:22px;margin-bottom:16px}
  .glossary-search-label{display:block;font-size:13px;color:var(--muted);font-weight:700;margin-bottom:6px}
  .glossary-search{width:100%;min-height:44px;border:1px solid var(--border);border-radius:8px;
    background:var(--card);color:var(--text);font:inherit;padding:10px 12px;margin-bottom:14px}
  .glossary-search:focus{outline:2px solid var(--accent);outline-offset:2px}
  dl{display:flex;flex-direction:column;gap:12px}
  .termo{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 18px}
  .termo.is-hidden{display:none}
  dt{font-weight:700;color:var(--accent);margin-bottom:4px}
  dd{color:var(--text)}
  .quiz-head{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:start;margin-bottom:18px}
  .quiz-head h2{margin-bottom:0}
  .quiz-score{font-size:13px;color:var(--muted);border:1px solid var(--border);border-radius:999px;
    padding:6px 10px;white-space:nowrap}
  .quiz-reset{min-height:34px;border:1px solid var(--border);border-radius:6px;background:var(--sub);
    color:var(--text);font:inherit;font-size:13px;font-weight:700;padding:6px 10px;cursor:pointer}
  .quiz-reset:hover,.quiz-reset:focus{border-color:var(--accent);outline:none}
  .quiz-item{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:14px}
  .quiz-q{margin-bottom:10px}
  .quiz-opts{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
  .quiz-option{width:100%;min-height:44px;text-align:left;padding:9px 12px;border:1px solid var(--border);
    border-radius:6px;background:var(--sub);color:var(--text);font:inherit;cursor:pointer}
  .quiz-option:hover,.quiz-option:focus{border-color:var(--accent);outline:none}
  .quiz-option.target{border-color:var(--ok);background:var(--ok-bg);color:var(--ok-fg);font-weight:700}
  .quiz-option.miss{border-color:var(--bad);background:var(--bad-bg);color:var(--text)}
  .quiz-option:disabled{cursor:default}
  .quiz-feedback{font-size:14px;font-weight:700;margin-top:10px}
  .quiz-feedback.ok{color:var(--ok-fg)}
  .quiz-feedback.bad{color:var(--bad)}
  .quiz-exp{color:var(--muted);font-size:14px}
  ul.zk{list-style:none;display:flex;flex-direction:column;gap:12px}
  ul.zk li{background:var(--card);border:1px solid var(--border);border-left:3px solid var(--accent);
    border-radius:0 8px 8px 0;padding:14px 18px}
  .trace{font-size:11.5px;color:var(--muted);margin-top:10px;margin-bottom:0;
    border-top:1px dashed var(--border);padding-top:8px;cursor:help}
  .trace-flag{color:var(--warn);cursor:default}
  footer{text-align:center;color:var(--muted);font-size:12px;margin-top:48px;
    padding-top:20px;border-top:1px solid var(--border)}
  @media (max-width:767px){
    .guide-shell{display:block;padding:0 18px 64px}
    .guide-sidebar{position:sticky;top:0;z-index:10;margin:0 -18px 24px;border-radius:0;border-width:0 0 1px;
      max-height:none;overflow-x:auto;box-shadow:none}
    .guide-nav{flex-direction:row;gap:4px;padding:8px 12px}
    .guide-nav a{white-space:nowrap}
    header.capa{padding-top:28px}
    header.capa h1{font-size:28px}
    .quiz-head{grid-template-columns:1fr;gap:8px}
    .quiz-score,.quiz-reset{justify-self:start}
  }`;
}

/** Script no <head>: tema inicial por prefers-color-scheme se o app não mandar. */
function guideHeadScript(): string {
  return `(function(){try{var d=document.documentElement;if(!d.getAttribute('data-theme')){var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;d.setAttribute('data-theme',m?'dark':'light');}}catch(_){}})();`;
}

/** Tema via postMessage (Regra #2) + page-change derivado de [data-page] (D27). */
function guideNavScript(): string {
  return `
(function(){
  function bySel(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  window.addEventListener('message', function(e){
    var d = e && e.data;
    if (d && d.type === 'zetel:theme' && (d.theme === 'dark' || d.theme === 'light')) {
      document.documentElement.setAttribute('data-theme', d.theme);
    }
  });

  var glossarySearch = document.getElementById('glossary-search');
  if (glossarySearch) {
    var terms = bySel('.termo');
    glossarySearch.addEventListener('input', function(){
      var q = String(glossarySearch.value || '').toLocaleLowerCase('pt-BR').trim();
      terms.forEach(function(t){
        var hay = t.getAttribute('data-search-text') || t.textContent.toLocaleLowerCase('pt-BR');
        t.classList.toggle('is-hidden', q.length > 0 && hay.indexOf(q) === -1);
      });
    });
  }

  var score = document.getElementById('quiz-score');
  var reset = document.getElementById('quiz-reset');
  var quizItems = bySel('.quiz-item');
  var answered = 0;
  var hits = 0;
  function updateScore(){
    if (score) score.textContent = 'Pontuação: ' + hits + ' / ' + answered;
  }
  quizItems.forEach(function(item){
    bySel.call(null, '.quiz-option').filter(function(btn){ return item.contains(btn); }).forEach(function(btn){
      btn.addEventListener('click', function(){
        if (item.getAttribute('data-answered') === 'true') return;
        var chosen = Number(btn.getAttribute('data-option-index'));
        var target = Number(item.getAttribute('data-answer-index'));
        var buttons = bySel.call(null, '.quiz-option').filter(function(opt){ return item.contains(opt); });
        var targetButton = buttons.filter(function(opt){
          return Number(opt.getAttribute('data-option-index')) === target;
        })[0];
        var ok = chosen === target;
        item.setAttribute('data-answered', 'true');
        answered += 1;
        if (ok) hits += 1;
        buttons.forEach(function(opt){ opt.disabled = true; });
        if (targetButton) targetButton.classList.add('target');
        if (!ok) btn.classList.add('miss');
        var feedback = item.querySelector('.quiz-feedback');
        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'quiz-feedback ' + (ok ? 'ok' : 'bad');
          feedback.textContent = ok
            ? 'Acerto. A alternativa escolhida está correta.'
            : 'Ainda não. Resposta: ' + (targetButton ? targetButton.textContent : 'alternativa destacada') + '.';
        }
        var exp = item.querySelector('.quiz-exp');
        if (exp) exp.hidden = false;
        updateScore();
      });
    });
  });
  if (reset) {
    reset.addEventListener('click', function(){
      answered = 0;
      hits = 0;
      quizItems.forEach(function(item){
        item.setAttribute('data-answered', 'false');
        bySel.call(null, '.quiz-option').filter(function(btn){ return item.contains(btn); }).forEach(function(btn){
          btn.disabled = false;
          btn.classList.remove('target', 'miss');
        });
        var feedback = item.querySelector('.quiz-feedback');
        if (feedback) {
          feedback.hidden = true;
          feedback.className = 'quiz-feedback';
          feedback.textContent = '';
        }
        var exp = item.querySelector('.quiz-exp');
        if (exp) exp.hidden = true;
      });
      updateScore();
    });
  }

  var blocks = bySel('[data-page],[data-nav-section]');
  function post(idx){
    try { window.parent.postMessage({ type:'zetel:page-change', pageIndex: idx }, '*'); } catch(_){}
  }
  var last = -1;
  var activeNav = '';
  function setActiveNav(id){
    if (!id || id === activeNav) return;
    activeNav = id;
    bySel('[data-nav-target]').forEach(function(a){
      a.classList.toggle('is-active', a.getAttribute('data-nav-target') === id);
    });
  }
  var navSections = bySel('[data-nav-section]');
  function updateActiveFromViewport(){
    var focusLine = window.innerHeight * 0.35;
    var fallback = null;
    var fallbackDistance = Infinity;
    for (var n = 0; n < navSections.length; n += 1) {
      var el = navSections[n];
      var r = el.getBoundingClientRect();
      if (r.top <= focusLine && r.bottom >= focusLine) {
        setActiveNav(el.getAttribute('data-nav-section'));
        return;
      }
      if (r.bottom > 0 && r.top < window.innerHeight) {
        var distance = Math.abs(r.top - focusLine);
        if (distance < fallbackDistance) {
          fallbackDistance = distance;
          fallback = el;
        }
      }
    }
    if (fallback) setActiveNav(fallback.getAttribute('data-nav-section'));
  }
  if (blocks.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting) {
          if (en.target.hasAttribute('data-page')) {
            var i = Number(en.target.getAttribute('data-page'));
            if (!isNaN(i) && i !== last) { last = i; post(i); }
          }
        }
      });
      updateActiveFromViewport();
    }, { threshold: 0.15 });
    blocks.forEach(function(b){ io.observe(b); });
  }
  updateActiveFromViewport();
})();
`.trim();
}

export function renderStudyGuideHtml(
  guia: StudyGuide,
  sourceMap: StudyGuideSourceMap,
  displayName: string,
  builtAt: string,
): string {
  let buildDate: string;
  try {
    buildDate = new Date(builtAt).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    buildDate = builtAt.slice(0, 10);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="zetel-built" content="${esc(builtAt)}">
<title>${esc(guia.titulo)} — Guia de Estudo</title>
<style>${guideCss()}</style>
<script>${guideHeadScript()}</script>
</head>
<body>
  <div class="guide-shell">
    ${renderGuideNav(guia.secoes)}
    <main class="guide-main">
      <header id="capa" class="capa" data-nav-section="capa">
        <span class="brand">⚡ Zetel · Guia de Estudo</span>
        <h1>${esc(guia.titulo)}</h1>
        <p class="sub">${esc(guia.subtitulo)}</p>
        <div class="resumo"${pageAttr('resumo', sourceMap)}>${paragraphs(guia.resumo.texto)}${traceBadge('resumo', sourceMap)}</div>
        <p class="sub" style="font-size:13px;margin-top:18px">${esc(displayName)} · Gerado em ${esc(buildDate)}</p>
      </header>
      ${renderCards(guia.cards, sourceMap)}
      ${renderSecoes(guia.secoes, sourceMap)}
      ${renderGlossario(guia.glossario, sourceMap)}
      ${renderQuiz(guia.quiz, sourceMap)}
      ${renderZettelkasten(guia.perguntas_zettelkasten, sourceMap)}
      <footer>Renderizado por template determinístico (sem LLM). O conteúdo editorial foi gerado por IA a partir do material; verifique a origem nos selos de rastreabilidade.</footer>
    </main>
  </div>
  <script>${guideNavScript()}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

function resolveStudyGuideModel(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const perTask = getSetting('study_guide_model');
  if (perTask?.trim()) return perTask.trim();
  const setting = getSetting('default_model');
  if (setting?.trim()) return setting.trim();
  return getOpenRouterModel();
}

// Limites de geração (configuráveis em Configurações → Limites de Geração).

/**
 * max_tokens dimensionado pelo tamanho do catálogo (Spike 10C: ~4k consumidos),
 * limitado pelo teto configurado (`study_guide_max_tokens`).
 */
function sizeMaxTokens(blockCount: number, ceiling: number): number {
  const sized = STUDY_GUIDE_MAX_TOKENS_MIN + blockCount * 120;
  return Math.max(STUDY_GUIDE_MAX_TOKENS_MIN, Math.min(ceiling, sized));
}

/** Lê e limita o teto de tokens configurado (default 16000, faixa 4000–32000). */
function resolveStudyGuideMaxTokensCeiling(): number {
  const raw = getSetting('study_guide_max_tokens');
  if (!raw) return DEFAULT_STUDY_GUIDE_MAX_TOKENS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_STUDY_GUIDE_MAX_TOKENS;
  return Math.min(STUDY_GUIDE_MAX_TOKENS_MAX, Math.max(STUDY_GUIDE_MAX_TOKENS_MIN, n));
}

/** Lê e limita o timeout configurado em ms (default 120s, faixa 30–300s). */
function resolveStudyGuideTimeoutMs(): number {
  const raw = getSetting('study_guide_timeout_s');
  let s = DEFAULT_STUDY_GUIDE_TIMEOUT_S;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) {
      s = Math.min(STUDY_GUIDE_TIMEOUT_S_MAX, Math.max(STUDY_GUIDE_TIMEOUT_S_MIN, n));
    }
  }
  return s * 1000;
}

const CATALOG_SNIPPET_CHARS = 220;
const CHARS_PER_TOKEN_EST = 4;
/** Fração do orçamento estimado de prompt reservada ao catálogo JSON. */
const CATALOG_PROMPT_FRACTION = 0.28;

/** Orçamento de caracteres do catálogo no system prompt (evita crescimento ilimitado). */
function catalogPromptCharBudget(blockCount: number, maxCompletionTokens: number): number {
  const promptTokensEst = Math.min(128_000, 8_000 + blockCount * 120 + maxCompletionTokens * 0.15);
  const fromFraction = Math.floor(promptTokensEst * CATALOG_PROMPT_FRACTION * CHARS_PER_TOKEN_EST);
  return Math.max(6_000, Math.min(fromFraction, 60_000));
}

/** Seleciona blocos na ordem do documento até o orçamento de caracteres do catálogo. */
function selectBlocksForCatalog(
  blocks: SourceBlock[],
  budgetChars: number,
): { blocks: SourceBlock[]; omitted: number } {
  const selected: SourceBlock[] = [];
  let used = 2; // '[]'
  for (const b of blocks) {
    const snippet =
      b.text.length > CATALOG_SNIPPET_CHARS ? b.text.slice(0, CATALOG_SNIPPET_CHARS) + '…' : b.text;
    const entryLen =
      JSON.stringify({
        block_id: b.block_id,
        type: b.type,
        heading_path: b.heading_path,
        source_file: b.source_file,
        sha256: b.sha256,
        text: snippet.replace(/\s+/g, ' '),
      }).length + 1;
    if (selected.length > 0 && used + entryLen > budgetChars) break;
    selected.push(b);
    used += entryLen;
  }
  return { blocks: selected, omitted: blocks.length - selected.length };
}

/**
 * Gera o Guia de Estudo e grava os 3 artefatos. Lança em pré-condição inválida
 * (sem páginas) ou guia incompleto — nesses casos nada é gravado.
 */
export async function generateStudyGuide(
  db: Database.Database,
  vaultPath: string,
  zetelId: string,
  explicitModel?: string,
): Promise<StudyGuideResult> {
  const builtAt = new Date().toISOString();
  const slug = assertZetelAtivo(db, zetelId);
  const zetel = getZetelById(db, zetelId);
  if (!zetel) throw new Error('Zetel não encontrado.');

  const dbPages = listPages(db, zetelId);
  if (dbPages.length === 0) {
    throw new Error('Este Zetel não tem páginas. Execute "Processar" na aba Arquivos primeiro.');
  }

  const { files, fullMarkdown, pagesCount } = loadSegmentedFiles(db, vaultPath, slug, zetelId);
  if (pagesCount !== dbPages.length) {
    throw new Error(
      'A estrutura de páginas não coincide com o banco. Execute "Processar" na aba Arquivos e tente novamente.',
    );
  }

  const index = buildSourceIndex(files);
  const model = resolveStudyGuideModel(explicitModel);
  const maxTokens = sizeMaxTokens(index.blocks.length, resolveStudyGuideMaxTokensCeiling());
  const timeoutMs = resolveStudyGuideTimeoutMs();
  const catalogBudget = catalogPromptCharBudget(index.blocks.length, maxTokens);
  const { blocks: catalogBlocks, omitted: catalogOmitted } = selectBlocksForCatalog(
    index.blocks,
    catalogBudget,
  );
  if (catalogOmitted > 0) {
    logger.info('study guide catalog truncated', {
      zetelId,
      total: index.blocks.length,
      included: catalogBlocks.length,
      omitted: catalogOmitted,
    });
  }
  const catalog = catalogForPrompt({ blocks: catalogBlocks, byHash: index.byHash });
  const apiKey = readApiKey();

  const system = buildSystemPrompt(catalog, catalogOmitted);
  const user = buildUserPrompt(fullMarkdown);

  logger.info('study guide generate start', {
    zetelId,
    model,
    blocks: index.blocks.length,
    maxTokens,
    timeoutMs,
  });

  const { content, usage } = await requestJson({
    apiKey,
    model,
    system,
    user,
    maxTokens,
    timeoutMs,
  });

  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    // Regra #6: não logar/gravar o conteúdo cru (poderia conter material do usuário).
    throw new Error('O modelo não retornou um JSON válido. Tente novamente ou troque o modelo.');
  }

  const { quiz, removed: quizRemoved } = hardenQuiz((parsed as Record<string, unknown>)?.quiz);
  if (quizRemoved > 0) {
    logger.info('study guide quiz items removed', { zetelId, removed: quizRemoved });
  }

  const guia = validateAndNormalize(parsed, quiz);
  const trace = computeTraceability(guia, index);

  // Artefatos.
  const outDir = zetelArtefatosDir(vaultPath, slug);
  mkdirSync(outDir, { recursive: true });

  const html = renderStudyGuideHtml(guia, trace.sourceMap, zetel.displayName, builtAt);
  const outputPath = guiaEstudoHtmlPath(vaultPath, slug);
  writeFileSync(outputPath, html, 'utf8');

  writeFileSync(
    guiaEstudoSourcePath(vaultPath, slug),
    JSON.stringify(trace.sourceMap, null, 2),
    'utf8',
  );

  const counts = {
    cards: guia.cards.length,
    secoes: guia.secoes.length,
    glossario: guia.glossario.length,
    quiz: guia.quiz.length,
    zettelkasten: guia.perguntas_zettelkasten.length,
  };
  const meta = {
    model,
    generatedAt: builtAt,
    displayName: zetel.displayName,
    tokens: usage,
    counts,
    traceability: {
      coveragePct: Number(trace.coveragePct.toFixed(1)),
      orphans: trace.orphans,
      flaggedItems: trace.flaggedItems,
    },
    sourceFiles: files.map((f) => f.sourceFile),
    quizRemoved,
  };
  writeFileSync(guiaEstudoMetaPath(vaultPath, slug), JSON.stringify(meta, null, 2), 'utf8');

  const sizeBytes = statSync(outputPath).size;

  logger.info('study guide generated', {
    zetelId,
    model,
    coveragePct: Number(trace.coveragePct.toFixed(1)),
    orphans: trace.orphans,
    flaggedItems: trace.flaggedItems,
    tokensTotal: usage?.totalTokens ?? 0,
  });

  return {
    model,
    outputPath,
    sizeBytes,
    counts,
    tokens: usage,
    traceability: {
      totalItems: trace.totalItems,
      withValidHash: trace.withValidHash,
      coveragePct: Number(trace.coveragePct.toFixed(1)),
      orphans: trace.orphans,
      flaggedItems: trace.flaggedItems,
    },
    quizRemoved,
  };
}
