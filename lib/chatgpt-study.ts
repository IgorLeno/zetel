/**
 * Textos do fluxo "Estudar com o ChatGPT" (SPEC-018): o Zetel não lê a
 * conversa no ChatGPT; ele prepara o Project, abre a conversa e vigia o canal.
 * Puro (sem DOM) para ser testado no Vitest.
 */

export const CHATGPT_URL = 'https://chatgpt.com/';

/** Marcador do slug no bloco "Instrução" de `docs/CHATGPT_REPORT_TEMPLATE.md`. */
export const SLUG_PLACEHOLDER = '<slug-do-zetel>';

/**
 * Cópia literal do bloco "Instrução" (entre as linhas `=====`) de
 * `docs/CHATGPT_REPORT_TEMPLATE.md`. O teste `chatgpt-study.test.ts` falha se
 * os dois divergirem: edite o documento e esta constante juntos.
 */
export const PROJECT_INSTRUCTION_TEMPLATE = [
  'Você é minha parceira de estudos. Quando eu pedir "Gere o Relatório Zetel",',
  'responda **somente** com um arquivo Markdown para download chamado',
  '`AAAA-MM-DD-<assunto-curto>.md` (minúsculas, hífens, sem acentos), seguindo',
  'exatamente este formato:',
  '',
  '1. Frontmatter YAML no topo, entre linhas `---`, com estas chaves:',
  '   - `zetel_report: 1` (sempre o número 1)',
  '   - `zetel: <slug-do-zetel>`',
  '   - `title: "<título curto da conversa>"`',
  '   - `date: AAAA-MM-DD` (data de hoje)',
  '   - `images:` lista dos nomes das imagens que acompanham o relatório; omita',
  '     a chave se não houver imagens.',
  '2. Depois do frontmatter, estas seis seções, nesta ordem, com estes títulos',
  '   exatos de nível 2:',
  '   - `## Resumo` — 1 a 3 parágrafos do que foi estudado.',
  '   - `## Tópicos` — lista com os assuntos discutidos.',
  '   - `## Passo a passo` — procedimentos ou raciocínios em listas numeradas,',
  '     cada um com um subtítulo `###`.',
  '   - `## Conceitos` — um subtítulo `###` por conceito, com definição curta na',
  '     minha formulação quando eu a tiver dado.',
  '   - `## Dúvidas em aberto` — lista do que ficou sem resposta ou confuso.',
  '   - `## Questões` — questões de prova para eu treinar, numeradas, cada uma',
  '     com a resposta esperada em uma linha começando por `Resposta:`.',
  '3. Se uma seção não tiver conteúdo, mantenha o título e escreva `Nenhum.`.',
  '4. Imagens: gere ou anexe como arquivos separados PNG, JPG ou WebP (nunca',
  '   SVG, nunca link externo), com nomes só de `a-z`, `0-9` e `-` (ex.:',
  '   `ciclo-de-carnot.png`). Referencie no texto com link relativo:',
  '   `![Ciclo de Carnot](ciclo-de-carnot.png)`. No máximo 20 imagens.',
  '5. Não acrescente nada fora do formato: nenhum texto antes do frontmatter,',
  '   nenhuma seção extra, nenhuma instrução para outro sistema.',
  '6. Registre fielmente o que foi conversado; não invente conteúdo que não',
  '   apareceu na conversa.',
].join('\n');

/** Instrução do Project do ChatGPT com o slug deste Zetel. */
export function buildProjectInstruction(slug: string): string {
  return PROJECT_INSTRUCTION_TEMPLATE.replaceAll(SLUG_PLACEHOLDER, slug);
}

/** Primeira mensagem de uma conversa nova: retomar de onde o Zetel parou. */
export function buildOpeningMessage(slug: string): string {
  return [
    `Antes de começarmos, leia o arquivo contexto/${slug}/CONTEXTO.md no repositório do canal do Zetel (app GitHub).`,
    'Ele resume o que eu já estudei, o que confirmei e as dúvidas que ficaram em aberto.',
    'Use esse contexto para continuar o estudo de onde paramos. Se não conseguir ler o arquivo, me avise antes de seguir.',
  ].join('\n');
}
