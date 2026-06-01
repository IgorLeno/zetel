import { describe, expect, it } from 'vitest';
import { buildSourceIndex } from '@/lib/source-index';
import {
  computeTraceability,
  validateAndNormalize,
} from '@/lib/study-guide-service';
import type { QuizItem, StudyGuide } from '@/lib/study-guide-service';
import type { RootContent } from 'mdast';

function paragraphNode(value: string): RootContent {
  return { type: 'paragraph', children: [{ type: 'text', value }] } as RootContent;
}

function makeGuide(overrides: Partial<StudyGuide> = {}): StudyGuide {
  const base: StudyGuide = {
    titulo: 'Guia Teste',
    subtitulo: 'Sub',
    resumo: { texto: 'Resumo.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Conceito', conteudo: 'Desc.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção 1', conteudo: 'Texto.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'T', definicao: 'D.' }],
    quiz: [
      {
        guide_block_id: 'quiz-1',
        pergunta: 'P?',
        opcoes: ['A', 'B'],
        resposta_correta: 'A',
        explicacao: 'E.',
      },
    ],
    perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
  };
  return { ...base, ...overrides };
}

describe('computeTraceability', () => {
  it('itens sem hashes citados ficam flagged:true', () => {
    const index = buildSourceIndex([]);
    const guia = makeGuide();
    const trace = computeTraceability(guia, index);
    // Nenhum hash no catálogo, então todos são flagged
    expect(trace.flaggedItems).toBeGreaterThan(0);
    const resumoEntry = trace.sourceMap['resumo'];
    expect(resumoEntry?.flagged).toBe(true);
  });

  it('hash órfão incrementa contador orphans', () => {
    const index = buildSourceIndex([]);
    // Guia com hash que não existe no catálogo
    const guia = makeGuide({
      cards: [{
        guide_block_id: 'card-1',
        titulo: 'C',
        conteudo: 'D.',
        source_block_hashes: ['hash-inexistente'],
      }],
    });
    const trace = computeTraceability(guia, index);
    expect(trace.orphans).toBeGreaterThanOrEqual(1);
  });

  it('item com hash válido não é flagged', () => {
    const file = {
      sourceFile: 'doc.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode('Texto do card.')] }],
    };
    const index = buildSourceIndex([file]);
    const validHash = index.blocks[0].sha256;

    const guia = makeGuide({
      cards: [{
        guide_block_id: 'card-1',
        titulo: 'Card',
        conteudo: 'Desc.',
        source_block_hashes: [validHash],
      }],
    });
    const trace = computeTraceability(guia, index);
    const cardEntry = trace.sourceMap['card-1'];
    expect(cardEntry?.flagged).toBeUndefined();
    expect(cardEntry?.source_block_hashes).toContain(validHash);
  });

  it('cobertura é 100% quando todos têm hash válido', () => {
    const file = {
      sourceFile: 'doc.md',
      pages: [{ pageIndex: 0, nodes: [paragraphNode('Conteúdo único.')] }],
    };
    const index = buildSourceIndex([file]);
    const validHash = index.blocks[0].sha256;

    const guia: StudyGuide = {
      titulo: 'T',
      subtitulo: 'S',
      resumo: { texto: 'R.', source_block_hashes: [validHash] },
      cards: [{ guide_block_id: 'card-1', titulo: 'C', conteudo: 'D.', source_block_hashes: [validHash] }],
      secoes: [{ guide_block_id: 'sec-1', titulo: 'S', conteudo: 'T.', source_block_hashes: [validHash] }],
      glossario: [{ guide_block_id: 'glo-1', termo: 'T', definicao: 'D.', source_block_hashes: [validHash] }],
      quiz: [{
        guide_block_id: 'quiz-1',
        pergunta: 'P?',
        opcoes: ['A', 'B'],
        resposta_correta: 'A',
        explicacao: '',
        source_block_hashes: [validHash],
      }],
      perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?', source_block_hashes: [validHash] }],
    };
    const trace = computeTraceability(guia, index);
    expect(trace.coveragePct).toBe(100);
    expect(trace.flaggedItems).toBe(0);
  });
});

describe('validateAndNormalize', () => {
  function makeQuiz(overrides: Partial<QuizItem> = {}): QuizItem {
    return {
      guide_block_id: 'quiz-1',
      pergunta: 'P?',
      opcoes: ['A', 'B'],
      resposta_correta: 'A',
      explicacao: '',
      ...overrides,
    };
  }

  it('aceita objeto válido completo', () => {
    const raw = {
      titulo: 'T',
      subtitulo: 'S',
      resumo: { texto: 'R.' },
      cards: [{ guide_block_id: 'c-1', titulo: 'C', conteudo: 'D.' }],
      secoes: [{ guide_block_id: 's-1', titulo: 'S', conteudo: 'T.' }],
      glossario: [{ guide_block_id: 'g-1', termo: 'T', definicao: 'D.' }],
      perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
    };
    const quiz = [makeQuiz()];
    expect(() => validateAndNormalize(raw, quiz)).not.toThrow();
  });

  it('lança quando titulo ausente', () => {
    const raw = {
      subtitulo: 'S',
      resumo: { texto: 'R.' },
      cards: [{ guide_block_id: 'c-1', titulo: 'C', conteudo: 'D.' }],
      secoes: [{ guide_block_id: 's-1', titulo: 'S', conteudo: 'T.' }],
      glossario: [{ guide_block_id: 'g-1', termo: 'T', definicao: 'D.' }],
      perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
    };
    expect(() => validateAndNormalize(raw, [makeQuiz()])).toThrow(/titulo/);
  });

  it('lança quando cards vazio', () => {
    const raw = {
      titulo: 'T',
      subtitulo: 'S',
      resumo: { texto: 'R.' },
      cards: [],
      secoes: [{ guide_block_id: 's-1', titulo: 'S', conteudo: 'T.' }],
      glossario: [{ guide_block_id: 'g-1', termo: 'T', definicao: 'D.' }],
      perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
    };
    expect(() => validateAndNormalize(raw, [makeQuiz()])).toThrow(/cards/);
  });

  it('lança quando quiz hardenado está vazio', () => {
    const raw = {
      titulo: 'T',
      subtitulo: 'S',
      resumo: { texto: 'R.' },
      cards: [{ guide_block_id: 'c-1', titulo: 'C', conteudo: 'D.' }],
      secoes: [{ guide_block_id: 's-1', titulo: 'S', conteudo: 'T.' }],
      glossario: [{ guide_block_id: 'g-1', termo: 'T', definicao: 'D.' }],
      perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
    };
    expect(() => validateAndNormalize(raw, [])).toThrow(/quiz/);
  });

  it('lança para raw não-objeto', () => {
    expect(() => validateAndNormalize('string', [])).toThrow();
    expect(() => validateAndNormalize(null, [])).toThrow();
  });
});
