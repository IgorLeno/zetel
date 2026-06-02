import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChatMessage } from '@/types/chat-message';
import type { NoteTipo } from './notes-service';
import { readAllMemoriesContent, listMemoryTitles, MEMORY_FILE_WARN_BYTES } from './memory-service';
import { logger } from './logger';

const PAGE_CONTEXT_MAX = 3000;

/** Marcadores que delimitam o bloco JSON de sugestão de nota no stream (Módulo 6). */
export const NOTE_MARK_START = '<<<NOTA_SUGERIDA>>>';
export const NOTE_MARK_END = '<<<FIM_NOTA>>>';

/** Marcadores da sugestão de memória global (Módulo 7) — distintos dos de nota. */
export const MEMORY_MARK_START = '<<<MEMORIA_SUGERIDA>>>';
export const MEMORY_MARK_END = '<<<FIM_MEMORIA>>>';

/**
 * Orçamento de tokens do turno (sem catálogo de context_window — fallback fixo).
 * A memória global consome no máximo 40% desse orçamento (§11).
 *
 * Valor conservador e independente do modelo: ainda não temos a `context_window`
 * por modelo do OpenRouter. Modelos modernos têm janelas ≫ 8k, então o risco de
 * estouro é baixo. Quando passarmos a ler a janela real por modelo (settings),
 * este valor deve virar `min(context_window * fração, teto)` em vez de constante.
 */
const TURN_TOKEN_BUDGET = 8000;
const MEMORY_TOKEN_BUDGET = Math.floor(TURN_TOKEN_BUDGET * 0.4); // 3200

/** Prompt-base do parceiro de estudos (lido de config/prompts/parceiro.md no vault). */
export const PARCEIRO_PROMPT = `# Prompt do parceiro de estudos

Você é um parceiro de estudos. Responda sempre em PT-BR. Seja preciso e objetivo.

Seu papel é ajudar o usuário a compreender e aprofundar o material que está estudando,
fazendo perguntas, esclarecendo conceitos, apontando conexões e sugerindo reflexões.
Não reproduza passagens longas do texto — prefira explicar com suas próprias palavras.`;

const PLACEHOLDER_MARKER = '<!-- Conteúdo a definir';

/**
 * Garante que `config/prompts/parceiro.md` exista e contenha um prompt real.
 * Só escreve se ausente ou se ainda contém o placeholder de inicialização —
 * nunca sobrescreve edição do usuário (D10; prompts vivem no vault).
 * Lido sob demanda a cada turno (regra #5 — sem cache de processo).
 */
export async function ensureParceiroPrompt(vaultPath: string): Promise<string> {
  const dir = join(vaultPath, 'config', 'prompts');
  const file = join(dir, 'parceiro.md');
  try {
    const current = await readFile(file, 'utf8');
    if (!current.includes(PLACEHOLDER_MARKER)) return current;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, PARCEIRO_PROMPT);
  logger.info('parceiro prompt ensured');
  return PARCEIRO_PROMPT;
}

/** Aproximação grosseira de tokens (mesma heurística do PRD §11). */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface MemoryWarnings {
  /** quantas memórias foram cortadas por exceder o orçamento. */
  truncatedCount: number;
  /** há ao menos um arquivo de memória acima de MEMORY_FILE_WARN_BYTES. */
  hasLongFile: boolean;
}

export interface MemoryContext {
  /** Bloco de conteúdo já truncado (mais recentes priorizadas). */
  text: string;
  /** Todos os títulos (mesmo os truncados) — para anti-duplicatas no prompt. */
  titles: string[];
  warnings: MemoryWarnings;
}

export type ReadingMode = 'tecnico' | 'guia-estudo';

export interface ReadingLocationContext {
  readingMode: ReadingMode;
  pageIndex: number | null;
  guideBlockId?: string | null;
  guideSectionId?: string | null;
  guideBlockTitle?: string | null;
  /** Posição global do bloco na sequência visual do Guia (1-based). */
  guideBlockIndex?: number | null;
  /** Total de blocos visuais do Guia. */
  guideBlockTotal?: number | null;
  sourceHeadings?: string[];
  sourceBlockHashes?: string[];
  sourceFiles?: string[];
  sourcePageIndices?: number[];
}

/**
 * Lê a memória global **sob demanda** (regra #5 — nunca cache de processo) e a
 * trunca a 40% do orçamento do turno. Corta arquivos inteiros, priorizando as
 * memórias mais recentes (§11): para no primeiro arquivo que não couber.
 */
export function buildMemoryContext(vaultPath: string): MemoryContext {
  const entries = readAllMemoriesContent(vaultPath); // mais recentes primeiro
  const titles = listMemoryTitles(vaultPath);
  const hasLongFile = entries.some((e) => e.bytes > MEMORY_FILE_WARN_BYTES);

  const kept: string[] = [];
  let used = 0;
  let truncatedCount = 0;
  for (const e of entries) {
    const block = `## ${e.titulo}\n${e.corpo}`;
    const cost = approxTokens(block);
    if (used + cost > MEMORY_TOKEN_BUDGET) {
      // recência tem prioridade: as restantes (mais antigas) ficam de fora.
      truncatedCount = entries.length - kept.length;
      break;
    }
    kept.push(block);
    used += cost;
  }

  return {
    text: kept.join('\n\n'),
    titles,
    warnings: { truncatedCount, hasLongFile },
  };
}

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Sugestão de nota validada, sem `justificativa` (essa nunca sai do backend). */
export interface NoteSuggestion {
  tipo: NoteTipo;
  titulo: string;
  corpo: string;
  paginaOrigem: string | null;
}

export function truncatePageContext(text: string): string {
  if (text.length <= PAGE_CONTEXT_MAX) return text;
  return text.slice(0, PAGE_CONTEXT_MAX) + '...';
}

/** Instruções de estilo oral injetadas quando interactionMode='voice' (PRD v4 Parte C). */
const VOICE_STYLE_PROMPT = `Você está em modo conversa por voz. Adapte seu estilo:
- Responda como conversa falada, não como artigo escrito.
- Use frases curtas e diretas.
- Evite tabelas, listas longas e Markdown estrutural.
- Explique em passos pequenos, um de cada vez.
- Quando fizer sentido, termine com uma pergunta curta para manter a conversa.
- Use o documento aberto como base, mas fale naturalmente.
- Não leia trechos longos do documento em voz alta.`;

export function buildOpenRouterMessages(opts: {
  displayName: string;
  pageContent: string | null;
  history: ChatMessage[];
  userMessage: string;
  readingLocation?: ReadingLocationContext;
  noteRubric?: string;
  memoryRubric?: string;
  existingTitles?: string[];
  /** Caminho do vault — habilita a injeção da memória global (lida sob demanda). */
  vaultPath?: string;
  /** Prompt-base do parceiro (lido de config/prompts/parceiro.md). Se ausente, usa default embutido. */
  partnerPrompt?: string;
  /** Modo de interação: 'voice' injeta instruções de estilo oral no system prompt. Default: 'text'. */
  interactionMode?: 'text' | 'voice';
}): { messages: OpenRouterMessage[]; memoryWarnings: MemoryWarnings } {
  const basePrompt = opts.partnerPrompt ?? PARCEIRO_PROMPT;
  let systemContent = `${basePrompt}\n\nZetel atual: "${opts.displayName}".`;

  if (opts.interactionMode === 'voice') {
    systemContent += `\n\n${VOICE_STYLE_PROMPT}`;
  }

  // Ordem §8.7: prompt do parceiro → rubricas → memória global → (página/histórico).
  if (opts.noteRubric) {
    systemContent += `\n\n${opts.noteRubric}`;
  }
  if (opts.memoryRubric) {
    systemContent += `\n\n${opts.memoryRubric}`;
  }

  let memoryWarnings: MemoryWarnings = { truncatedCount: 0, hasLongFile: false };
  if (opts.vaultPath) {
    const mem = buildMemoryContext(opts.vaultPath);
    memoryWarnings = mem.warnings;
    // Injeta o CONTEÚDO das memórias com instrução explícita de uso (§8.7 / regra #5).
    // O rótulo é diretivo ("USE") para que o LLM adapte seu comportamento — sem instrução
    // explícita, o LLM pode tratar as memórias como referência passiva em vez de ativas.
    if (mem.text) {
      systemContent += `\n\nMemória global do usuário — USE estas informações para adaptar suas respostas:\n\n${mem.text}`;
    }
    // Títulos separados: usados apenas para evitar sugestões duplicadas (§11 anti-padrão).
    // Aparecem APÓS o conteúdo para que o LLM não confunda "evitar duplicatas" com "ignorar".
    if (mem.titles.length > 0) {
      systemContent += `\n\nTítulos das memórias acima (para evitar sugestões duplicadas): ${mem.titles.join(', ')}`;
    }
  }

  if (opts.existingTitles && opts.existingTitles.length > 0) {
    systemContent += `\n\nNotas já existentes neste Zetel (não duplique):\n- ${opts.existingTitles.join('\n- ')}`;
  }

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: systemContent,
    },
  ];

  if (opts.readingLocation) {
    const loc = opts.readingLocation;
    const isGuia = loc.readingMode === 'guia-estudo';
    const lines = [
      'Localização visual atual do usuário:',
      `- Modo de leitura: ${isGuia ? 'Guia de Estudo' : 'Documento Técnico'}`,
    ];

    if (isGuia) {
      // Localização principal: bloco visual do Guia
      if (typeof loc.guideBlockIndex === 'number' && typeof loc.guideBlockTotal === 'number') {
        lines.push(`- Bloco visual atual do Guia: ${loc.guideBlockIndex} de ${loc.guideBlockTotal}`);
      } else if (loc.guideBlockId) {
        lines.push(`- Bloco visual do Guia: ${loc.guideBlockId}`);
      }
      if (loc.guideSectionId) lines.push(`- Seção visual do Guia: ${loc.guideSectionId}`);
      if (loc.guideBlockTitle) lines.push(`- Título do bloco visual: ${loc.guideBlockTitle}`);
      if (loc.guideBlockId) lines.push(`- ID interno do bloco: ${loc.guideBlockId}`);
      // Localização secundária: origem no Markdown
      if (loc.sourceHeadings?.length) {
        lines.push(`- Headings de origem no Markdown: ${loc.sourceHeadings.join(' > ')}`);
      }
      if (loc.sourceFiles?.length) {
        lines.push(`- Arquivo(s) de origem: ${loc.sourceFiles.join(', ')}`);
      }
      if (loc.sourcePageIndices?.length) {
        lines.push(`- Página(s) de origem no Markdown: ${loc.sourcePageIndices.join(', ')}`);
      }
      if (loc.sourceBlockHashes?.length) {
        lines.push(`- Hash(es) de origem validado(s): ${loc.sourceBlockHashes.join(', ')}`);
      }
      lines.push(
        'INSTRUÇÃO DE LOCALIZAÇÃO: Quando o usuário perguntar "em que página estou?", "em que bloco estou?" ou "onde estou?", responda primeiro com o bloco visual atual do Guia (ex: "Você está no bloco X de Y, seção Z, intitulado W"). NÃO chame o pageIndex de "página atual do Guia" — o pageIndex é apenas a página de origem no Markdown e deve ser mencionado só como informação secundária.',
      );
      lines.push(
        'INSTRUÇÃO DE SUGESTÃO: Para perguntas de localização, navegação, página, seção ou bloco atual, responda com texto visível normal e NÃO proponha nota nem memória nesse turno.',
      );
    } else {
      // Documento Técnico
      lines.push(
        `- Página atual do Documento Técnico: ${typeof loc.pageIndex === 'number' ? loc.pageIndex : 'desconhecida'}`,
      );
      lines.push(
        'Use esta localização para responder perguntas como "onde estou?" ou "qual página estou vendo"; use o Markdown como fonte principal de conhecimento.',
      );
    }

    messages.push({ role: 'user', content: lines.join('\n') });
    messages.push({
      role: 'assistant',
      content: isGuia
        ? 'Entendido. Vou usar o bloco visual do Guia como referência principal de localização. Para perguntas de localização, responderei com o número do bloco e seção sem propor notas ou memórias.'
        : 'Entendido. Vou usar a localização visual apenas como orientação de navegação.',
    });
  }

  if (opts.pageContent) {
    messages.push({
      role: 'user',
      content: `Contexto da página atual:\n\n${truncatePageContext(opts.pageContent)}`,
    });
    messages.push({
      role: 'assistant',
      content: 'Entendido. Estou pronto para discutir este trecho.',
    });
  }

  for (const m of opts.history) {
    // Filtra mensagens vazias — podem existir no SQLite por bugs anteriores (Tarefa 7).
    if (!m.content.trim()) continue;
    messages.push({
      role: m.role,
      content: m.content,
    });
  }

  messages.push({ role: 'user', content: opts.userMessage });
  return { messages, memoryWarnings };
}

export function resolveChatModel(
  bodyModel: string | undefined,
  settingsModel: string | null,
  configModel: string,
): string {
  if (bodyModel?.trim()) return bodyModel.trim();
  if (settingsModel?.trim()) return settingsModel.trim();
  return configModel;
}

export function resolveHistoryWindow(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(n)) return 10;
  return Math.min(50, Math.max(1, n));
}

function isTipo(v: unknown): v is NoteTipo {
  return v === 'rapida' || v === 'literatura';
}

/**
 * Separa a resposta do parceiro em narrativa visível + sugestão de nota (se houver).
 * O bloco delimitado por NOTE_MARK_START/END é extraído e validado; a `justificativa`
 * é descartada aqui — nunca trafega para o cliente (regra: nunca exibida na UI).
 * JSON malformado degrada para resposta normal (suggestion = null).
 */
export function extractNoteSuggestion(fullContent: string): {
  narrative: string;
  suggestion: NoteSuggestion | null;
} {
  const start = fullContent.indexOf(NOTE_MARK_START);
  if (start === -1) return { narrative: fullContent.trim(), suggestion: null };

  const narrative = fullContent.slice(0, start).trim();
  const afterStart = fullContent.slice(start + NOTE_MARK_START.length);
  const endRel = afterStart.indexOf(NOTE_MARK_END);
  const jsonRaw = (endRel === -1 ? afterStart : afterStart.slice(0, endRel)).trim();

  try {
    const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
    if (
      !isTipo(parsed.tipo) ||
      typeof parsed.titulo !== 'string' ||
      typeof parsed.corpo !== 'string' ||
      !parsed.titulo.trim() ||
      !parsed.corpo.trim()
    ) {
      return { narrative, suggestion: null };
    }
    const paginaOrigem =
      typeof parsed.pagina_origem === 'string' && parsed.pagina_origem.trim() && parsed.pagina_origem !== 'null'
        ? parsed.pagina_origem.trim()
        : null;
    return {
      narrative,
      suggestion: {
        tipo: parsed.tipo,
        titulo: parsed.titulo.trim(),
        corpo: parsed.corpo.trim(),
        paginaOrigem,
      },
    };
  } catch {
    return { narrative, suggestion: null };
  }
}

/** Sugestão de memória validada, sem `justificativa` (essa nunca sai do backend). */
export interface MemorySuggestion {
  titulo: string;
  corpo: string;
}

/**
 * Extrai a sugestão de memória do conteúdo completo (Módulo 7). Espelha
 * `extractNoteSuggestion`: o bloco MEMORY_MARK_START/END é parseado e validado;
 * a `justificativa` é descartada aqui — nunca trafega para o cliente. JSON
 * malformado degrada para `suggestion: null`. Não calcula narrativa: a remoção
 * dos blocos finais é feita no route (que conhece ambas as sentinelas).
 */
export function extractMemorySuggestion(fullContent: string): {
  suggestion: MemorySuggestion | null;
} {
  const start = fullContent.indexOf(MEMORY_MARK_START);
  if (start === -1) return { suggestion: null };

  const afterStart = fullContent.slice(start + MEMORY_MARK_START.length);
  const endRel = afterStart.indexOf(MEMORY_MARK_END);
  const jsonRaw = (endRel === -1 ? afterStart : afterStart.slice(0, endRel)).trim();

  try {
    const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
    if (
      typeof parsed.titulo !== 'string' ||
      typeof parsed.corpo !== 'string' ||
      !parsed.titulo.trim() ||
      !parsed.corpo.trim()
    ) {
      return { suggestion: null };
    }
    return {
      suggestion: { titulo: parsed.titulo.trim(), corpo: parsed.corpo.trim() },
    };
  } catch {
    return { suggestion: null };
  }
}
