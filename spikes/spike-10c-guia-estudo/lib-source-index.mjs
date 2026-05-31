// Spike 10C — catálogo de blocos com hash, base da rastreabilidade (D26/D27).
//
// Espelha `parseMarkdownForSegmentation` de lib/ingestao-service.ts (mesma ordem
// de plugins: gfm → frontmatter(yaml) → math, depois strip do YAML inicial) e a
// técnica `sha256` de lib/render-service.ts. Determinístico, sem LLM.

import { createHash } from 'node:crypto';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/** sha256 hex — mesma função usada no pipeline de produção. */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** Texto plano de um nó MDAST (concatena `value` recursivamente). */
function toPlainText(node) {
  if (typeof node?.value === 'string') return node.value;
  if (Array.isArray(node?.children)) return node.children.map(toPlainText).join('');
  return '';
}

/**
 * Parser paritário com produção: GFM + frontmatter(yaml) + math, depois remove
 * apenas o frontmatter YAML inicial (preservando o resto intacto).
 */
export function parseMarkdownForSegmentation(markdown) {
  const tree = remark()
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath)
    .parse(markdown);

  while (tree.children[0]?.type === 'yaml') {
    tree.children.shift();
  }
  return tree;
}

/**
 * Segmenta o Markdown em blocos de topo, anexando a trilha de headings ativa.
 * Retorna: { blocks: [{ block_id, type, depth, heading_path, text, sha256 }], byHash: Map }.
 *
 * Headings entram no catálogo como blocos próprios E atualizam o contexto de
 * heading_path dos blocos seguintes — assim cada parágrafo/tabela/equação sabe
 * sob quais títulos vive (D26: source_headings).
 */
export function buildSourceIndex(markdown, sourceFile) {
  const tree = parseMarkdownForSegmentation(markdown);
  const blocks = [];
  const byHash = new Map();

  // headingStack[d] = texto do heading de profundidade d (1..6) atualmente ativo.
  const headingStack = [];

  let counter = 0;
  const nextId = () => `b${String(++counter).padStart(4, '0')}`;

  for (const node of tree.children) {
    const text = toPlainText(node).trim();

    if (node.type === 'heading') {
      const depth = node.depth;
      // Atualiza a pilha: substitui o nível atual e descarta níveis mais fundos.
      headingStack.length = depth - 1;
      headingStack[depth - 1] = text;
    }

    // headingPath = trilha de headings ativa (sem buracos), incluindo o próprio
    // heading quando o bloco É um heading.
    const headingPath = headingStack.filter((h) => typeof h === 'string' && h.length > 0);

    if (text.length === 0) continue; // pula nós vazios (quebras, etc.)

    const hash = sha256(text);
    const block = {
      block_id: nextId(),
      type: node.type,
      depth: node.type === 'heading' ? node.depth : null,
      heading_path: [...headingPath],
      text,
      sha256: hash,
    };
    blocks.push(block);
    if (!byHash.has(hash)) byHash.set(hash, block);
  }

  return { sourceFile, blocks, byHash };
}

/** Versão compacta do catálogo para injetar no prompt (trecho truncado). */
export function catalogForPrompt(index, maxChars = 220) {
  return index.blocks.map((b) => {
    const snippet = b.text.length > maxChars ? b.text.slice(0, maxChars) + '…' : b.text;
    return {
      block_id: b.block_id,
      type: b.type,
      heading_path: b.heading_path,
      sha256: b.sha256,
      text: snippet.replace(/\s+/g, ' '),
    };
  });
}
