import { describe, expect, it } from 'vitest';
import { renderStudyGuideHtml } from '@/lib/study-guide-service';
import type { StudyGuide, StudyGuideSourceMap } from '@/lib/study-guide-service';

const NOW = '2026-06-01T12:00:00.000Z';

function makeMinimalGuide(): StudyGuide {
  return {
    titulo: 'Guia de Teste',
    subtitulo: 'Subtítulo',
    resumo: { texto: 'Resumo do guia.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Conceito A', conteudo: 'Descrição A.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção Principal', conteudo: 'Texto da seção.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'Termo', definicao: 'Definição.' }],
    quiz: [{
      guide_block_id: 'quiz-1',
      pergunta: 'Pergunta?',
      opcoes: ['Opção A', 'Opção B'],
      resposta_correta: 'Opção A',
      explicacao: 'Explicação.',
    }],
    perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'Pergunta ZK?' }],
  };
}

function makeSourceMap(): StudyGuideSourceMap {
  return {
    resumo: {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: ['Cap 1'],
      source_block_hashes: ['abc123'],
      page_indices: [0],
    },
    'card-1': {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: ['Cap 1'],
      source_block_hashes: ['abc123'],
      page_indices: [0],
    },
    'sec-1': {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: ['Seção'],
      source_block_hashes: ['def456'],
      page_indices: [1],
    },
    'glo-1': {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: [],
      source_block_hashes: [],
      page_indices: [],
      flagged: true,
    },
    'quiz-1': {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: [],
      source_block_hashes: ['abc123'],
      page_indices: [0],
    },
    'zk-1': {
      source_file: 'doc.md',
      source_files: ['doc.md'],
      source_headings: [],
      source_block_hashes: [],
      page_indices: [],
      flagged: true,
    },
  };
}

describe('renderStudyGuideHtml', () => {
  let html: string;

  it('gera HTML válido sem lançar', () => {
    expect(() => {
      html = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Zetel Teste', NOW);
    }).not.toThrow();
  });

  it('contém data-guide-block-id nos blocos', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('data-guide-block-id="card-1"');
    expect(h).toContain('data-guide-block-id="sec-1"');
  });

  it('contém data-guide-section-id nos blocos', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('data-guide-section-id=');
  });

  it('contém data-guide-block-title nos blocos', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('data-guide-block-title=');
  });

  it('contém data-page para blocos com page_indices', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('data-page="0"');
  });

  it('inclui readingMode:\'guia-estudo\' no script', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain("readingMode:'guia-estudo'");
  });

  it('inclui meta tag zetel-built com o timestamp', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('name="zetel-built"');
    expect(h).toContain(NOW);
  });

  it('links de navegação usam href="#..."', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('href="#capa"');
    expect(h).toContain('href="#conceitos-chave"');
  });

  it('não injeta URLs http:// ou https:// no HTML do template', () => {
    // Fixture controlada: guia sem URLs no conteúdo.
    // O template deve ser autocontido (CSS inline, sem CDN).
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    // Remove scripts e CSS inline antes de checar (eles podem ter referências de exemplo em comentários)
    // Checamos que não há src/href para recursos externos
    expect(h).not.toMatch(/src="https?:\/\//);
    expect(h).not.toMatch(/<link[^>]+href="https?:\/\//);
    expect(h).not.toMatch(/stylesheet.*https?:\/\//);
  });

  it('não carrega scripts externos (sem CDN)', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    // Não deve haver <script src="..."> externo
    expect(h).not.toMatch(/<script[^>]+src="https?:\/\//);
    // Não deve usar unpkg, cdn, etc.
    expect(h).not.toContain('unpkg.com');
    expect(h).not.toContain('cdn.jsdelivr');
    expect(h).not.toContain('cdnjs.cloudflare');
  });

  it('contém CSS inline (sem <link rel="stylesheet"> externo)', () => {
    const h = renderStudyGuideHtml(makeMinimalGuide(), makeSourceMap(), 'Z', NOW);
    expect(h).toContain('<style>');
    // Nenhum stylesheet externo
    expect(h).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="http/);
  });
});
