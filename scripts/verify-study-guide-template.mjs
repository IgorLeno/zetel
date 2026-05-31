import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/study-guide-service.ts', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

assert.match(
  source,
  /navLink\('secoes', 'Seções'\)/,
  'sidebar deve ter link proprio para o grupo "Seções"',
);
assert.match(
  source,
  /<section id="secoes" class="secoes" data-nav-section="secoes">/,
  'container de secoes deve ter id e data-nav-section proprios',
);
assert.match(
  source,
  /item\.querySelectorAll\('\.quiz-option'\)/,
  'quiz deve consultar opcoes localmente por item',
);
assert.doesNotMatch(
  source,
  /bySel\.call\(null, '\.quiz-option'\)/,
  'quiz nao deve consultar .quiz-option globalmente via bySel.call',
);

const systemPromptBody = source.match(/function buildSystemPrompt[\s\S]*?function buildUserPrompt/)?.[0] ?? '';
const userPromptBody = source.match(/function buildUserPrompt[\s\S]*?\/\/ ---------------------------------------------------------------------------\n\/\/ Parsing tolerante/)?.[0] ?? '';

assert.doesNotMatch(
  systemPromptBody,
  /comparison_tabs|accordions|timelines|tables/,
  'etapa 11.2 nao deve alterar o prompt de sistema para pedir campos v2',
);
assert.doesNotMatch(
  userPromptBody,
  /comparison_tabs|accordions|timelines|tables/,
  'etapa 11.2 nao deve alterar o prompt de usuario para pedir campos v2',
);
assert.match(source, /comparison_tabs\?: ComparisonTabsItem\[\]/, 'StudyGuide deve aceitar comparison_tabs opcional');
assert.match(source, /accordions\?: AccordionItem\[\]/, 'StudyGuide deve aceitar accordions opcional');
assert.match(source, /timelines\?: TimelineItem\[\]/, 'StudyGuide deve aceitar timelines opcional');
assert.match(source, /tables\?: EditorialTableItem\[\]/, 'StudyGuide deve aceitar tables opcional');
assert.match(source, /const ITEM_COLLECTIONS = \[[^\]]*'comparison_tabs'[^\]]*'accordions'[^\]]*'timelines'[^\]]*'tables'/s, 'ITEM_COLLECTIONS deve incluir os campos v2');
assert.match(source, /function renderV2Blocks/, 'template deve ter renderizador agregado para blocos v2');
assert.match(source, /class="comparison-tabs"/, 'comparison_tabs deve renderizar container de abas');
assert.match(source, /class="accordion-list"/, 'accordions deve renderizar lista expansivel');
assert.match(source, /class="timeline"/, 'timelines deve renderizar fluxo sequencial');
assert.match(source, /class="editorial-table-wrap"/, 'tables deve renderizar wrapper com scroll horizontal');
assert.match(source, /data-tab-target/, 'script inline deve alternar abas de comparison_tabs');
assert.equal(
  source.match(/new IntersectionObserver/g)?.length,
  1,
  'template deve continuar usando apenas um IntersectionObserver',
);

const ts = require('typescript');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleForRender = { exports: {} };
const sandbox = {
  module: moduleForRender,
  exports: moduleForRender.exports,
  require(id) {
    if (id === 'node:fs') {
      return {
        existsSync: () => false,
        mkdirSync: () => undefined,
        readFileSync: () => '',
        statSync: () => ({ size: 0 }),
        writeFileSync: () => undefined,
      };
    }
    if (id === 'node:path') return require('node:path');
    return new Proxy(
      {},
      {
        get() {
          return () => undefined;
        },
      },
    );
  },
};
vm.runInNewContext(compiled, sandbox);

const sourceMap = {
  resumo: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Intro'], source_block_hashes: ['h1'], page_indices: [0] },
  card1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Card'], source_block_hashes: ['h2'], page_indices: [1] },
  sec1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Secao'], source_block_hashes: ['h3'], page_indices: [2] },
  glo1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Glossario'], source_block_hashes: ['h4'], page_indices: [3] },
  quiz1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Quiz'], source_block_hashes: ['h5'], page_indices: [4] },
  zk1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Zk'], source_block_hashes: ['h6'], page_indices: [5] },
};
const baseGuide = {
  titulo: 'Guia v1',
  subtitulo: 'Subtitulo',
  resumo: { texto: 'Resumo' },
  cards: [{ guide_block_id: 'card1', titulo: 'Card', conteudo: 'Conteudo' }],
  secoes: [{ guide_block_id: 'sec1', titulo: 'Secao', conteudo: 'Texto' }],
  glossario: [{ guide_block_id: 'glo1', termo: 'Termo', definicao: 'Definicao' }],
  quiz: [{ guide_block_id: 'quiz1', pergunta: 'Pergunta', opcoes: ['A', 'B'], resposta_correta: 'A', explicacao: 'Exp' }],
  perguntas_zettelkasten: [{ guide_block_id: 'zk1', pergunta: 'Pergunta aberta' }],
};
const renderStudyGuideHtml = moduleForRender.exports.renderStudyGuideHtml;
const v1Html = renderStudyGuideHtml(baseGuide, sourceMap, 'Zetel', '2026-05-31T00:00:00.000Z');
assert.doesNotMatch(v1Html, /class="v2-blocks"/, 'guia v1 nao deve renderizar secao v2 vazia');

const v2SourceMap = {
  ...sourceMap,
  comp1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Comparacao'], source_block_hashes: ['h7'], page_indices: [6] },
  acc1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Ressalvas'], source_block_hashes: ['h8'], page_indices: [7] },
  time1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Processo'], source_block_hashes: ['h9'], page_indices: [8] },
  table1: { source_file: 'a.md', source_files: ['a.md'], source_headings: ['Tabela'], source_block_hashes: ['h10'], page_indices: [9] },
};
const v2Html = renderStudyGuideHtml(
  {
    ...baseGuide,
    comparison_tabs: [{
      guide_block_id: 'comp1',
      titulo: 'Comparacoes',
      tabs: [
        { titulo: 'Tabela A', colunas: ['Conceito', 'Valor'], linhas: [['A', '1']] },
        { titulo: 'Tabela B', colunas: ['Conceito', 'Valor'], linhas: [['B', '2']] },
      ],
    }],
    accordions: [{ guide_block_id: 'acc1', titulo: 'Limites', conteudo: 'Um detalhe longo.' }],
    timelines: [{ guide_block_id: 'time1', titulo: 'Fluxo', etapas: [{ titulo: 'Etapa', descricao: 'Descricao' }] }],
    tables: [{ guide_block_id: 'table1', titulo: 'Tabela editorial', colunas: ['A', 'B'], linhas: [['1', '2']] }],
  },
  v2SourceMap,
  'Zetel',
  '2026-05-31T00:00:00.000Z',
);
assert.match(v2Html, /id="comparison-1" class="comparison-tabs" data-nav-section="comparison-1" data-page="6"/, 'comparison_tabs deve ter ancora, nav-section e data-page');
assert.match(v2Html, /data-tab-target="comparison-1-tab-2"/, 'comparison_tabs deve gerar abas clicaveis');
assert.match(v2Html, /<section class="comparison-panel" id="comparison-1-tab-2" data-tab-panel="comparison-1-tab-2">/, 'paineis de comparacao devem ficar visiveis sem JS');
assert.match(v2Html, /class="accordion-list"/, 'accordions devem renderizar lista expansivel');
assert.match(v2Html, /<details>/, 'accordions devem iniciar recolhidos');
assert.match(v2Html, /class="timeline-marker">1<\/span>/, 'timelines devem renderizar marcador sequencial');
assert.match(v2Html, /id="editorial-table-1" class="editorial-table" data-nav-section="editorial-table-1" data-page="9"/, 'tables devem ter ancora, nav-section e data-page');
assert.match(v2Html, /↳ Tabela · 1 bloco\(s\) de origem/, 'blocos v2 devem exibir traceBadge');

console.log('study-guide template checks passed');
