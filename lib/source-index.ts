import type { RootContent } from 'mdast';
import { sha256, toPlainText } from './ingestao-service';

/**
 * Catálogo de blocos de origem do Guia de Estudo (Módulo 10D, porta o achado central
 * do Spike 10C). Cada bloco de topo do Markdown recebe um `sha256` do seu texto plano,
 * a trilha de headings ativa (`heading_path`), o arquivo de origem e o `page_index` da
 * página que o contém. O catálogo é injetado no prompt para que a LLM **copie** hashes
 * em vez de inventá-los; a validação pós-resposta confirma cada hash contra `byHash`.
 *
 * Invariantes:
 *  - Regra #1/R9: determinístico, sem LLM — só hashing dos nós já parseados.
 *  - R3: reaproveita `sha256` e `toPlainText` de `ingestao-service` (sem reparser próprio).
 *  - D27: `page_index` permite derivar, server-side, a página de origem de cada item do
 *    guia (o chat usa esse índice via D8, sem confiar em conteúdo do cliente — Regra #3).
 */

export interface SourceBlock {
  block_id: string;
  type: string;
  depth: number | null;
  heading_path: string[];
  source_file: string;
  page_index: number;
  text: string;
  sha256: string;
}

export interface SourceIndex {
  blocks: SourceBlock[];
  byHash: Map<string, SourceBlock[]>;
}

/** Uma página segmentada com seu índice global e os nós MDAST de topo que a compõem. */
export interface IndexablePage {
  pageIndex: number;
  nodes: RootContent[];
}

/** Um arquivo do Zetel já segmentado em páginas (ordem preservada). */
export interface IndexableFile {
  sourceFile: string;
  pages: IndexablePage[];
}

/**
 * Constrói o catálogo de blocos a partir dos arquivos já segmentados. Caminha
 * arquivos → páginas → nós de topo NA ORDEM do documento, mantendo um `headingStack`
 * por arquivo (headings não cruzam arquivos). Cada heading atualiza a pilha E entra
 * como bloco próprio; assim cada parágrafo/tabela/equação sabe sob quais títulos vive.
 */
export function buildSourceIndex(files: IndexableFile[]): SourceIndex {
  const blocks: SourceBlock[] = [];
  const byHash = new Map<string, SourceBlock[]>();

  let counter = 0;
  const nextId = () => `b${String(++counter).padStart(4, '0')}`;

  for (const file of files) {
    // headingStack[d-1] = texto do heading de profundidade d (1..6) atualmente ativo.
    const headingStack: string[] = [];

    for (const page of file.pages) {
      for (const node of page.nodes) {
        const text = toPlainText(node).trim();

        if (node.type === 'heading') {
          const depth = node.depth;
          // Substitui o nível atual e descarta níveis mais fundos.
          headingStack.length = depth - 1;
          headingStack[depth - 1] = text;
        }

        if (text.length === 0) continue; // pula nós vazios (quebras, etc.)

        // Trilha sem buracos, incluindo o próprio heading quando o bloco É um heading.
        const headingPath = headingStack.filter((h) => typeof h === 'string' && h.length > 0);

        const hash = sha256(text);
        const block: SourceBlock = {
          block_id: nextId(),
          type: node.type,
          depth: node.type === 'heading' ? node.depth : null,
          heading_path: [...headingPath],
          source_file: file.sourceFile,
          page_index: page.pageIndex,
          text,
          sha256: hash,
        };
        blocks.push(block);
        const existing = byHash.get(hash);
        if (existing) existing.push(block);
        else byHash.set(hash, [block]);
      }
    }
  }

  return { blocks, byHash };
}

export interface CatalogEntry {
  block_id: string;
  type: string;
  heading_path: string[];
  source_file: string;
  sha256: string;
  text: string;
}

/** Versão compacta do catálogo para o prompt (trecho truncado, whitespace colapsado). */
export function catalogForPrompt(index: SourceIndex, maxChars = 220): CatalogEntry[] {
  return index.blocks.map((b) => {
    const snippet = b.text.length > maxChars ? b.text.slice(0, maxChars) + '…' : b.text;
    return {
      block_id: b.block_id,
      type: b.type,
      heading_path: b.heading_path,
      source_file: b.source_file,
      sha256: b.sha256,
      text: snippet.replace(/\s+/g, ' '),
    };
  });
}
