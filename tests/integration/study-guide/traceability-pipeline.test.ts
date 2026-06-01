import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processZetel } from '@/lib/ingestao-service';
import { requestJson, readApiKey } from '@/lib/openrouter';
import {
  generateStudyGuide,
  guiaEstudoHtmlPath,
} from '@/lib/study-guide-service';
import { cleanupTempEnv, makeTempEnv, seedZetelWithFile, type TempEnv } from '@/tests/helpers/temp-env';

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));

vi.mock('@/lib/openrouter', () => ({
  readApiKey: vi.fn(() => 'test-api-key'),
  requestJson: vi.fn(),
}));

const mockedRequestJson = vi.mocked(requestJson);
vi.mocked(readApiKey);

/** Payload com um item de quiz válido e um com resposta_correta fora de opcoes. */
function payloadWithBadQuizItem(): string {
  return JSON.stringify({
    titulo: 'Rastreabilidade',
    subtitulo: 'Teste de endurecimento',
    resumo: { texto: 'Resumo do teste.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Card', conteudo: 'Conteúdo.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção', conteudo: 'Texto.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'Termo', definicao: 'Def.' }],
    quiz: [
      {
        guide_block_id: 'quiz-valido',
        pergunta: 'Pergunta válida?',
        opcoes: ['A', 'B'],
        resposta_correta: 'A',
        explicacao: 'A está correta.',
      },
      {
        guide_block_id: 'quiz-invalido',
        pergunta: 'Pergunta com resposta errada?',
        opcoes: ['X', 'Y'],
        resposta_correta: 'Z', // não está em opcoes → deve ser removido pelo hardenQuiz
        explicacao: 'Z seria correto.',
      },
    ],
    perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'Pergunta aberta?' }],
  });
}

/** Payload sem source_block_hashes — itens ficam flagged mas não são descartados. */
function payloadWithoutHashes(): string {
  return JSON.stringify({
    titulo: 'Sem Hashes',
    subtitulo: 'Teste de rastreabilidade parcial',
    resumo: { texto: 'Todos os itens sem hash.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Card', conteudo: 'Conteúdo.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção', conteudo: 'Texto.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'Termo', definicao: 'Def.' }],
    quiz: [
      {
        guide_block_id: 'quiz-1',
        pergunta: 'Pergunta?',
        opcoes: ['A', 'B'],
        resposta_correta: 'A',
        explicacao: 'A.',
      },
    ],
    perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'ZK?' }],
  });
}

describe('Rastreabilidade — pipeline de endurecimento e cobertura', () => {
  let env: TempEnv;

  beforeEach(() => {
    env = makeTempEnv();
    mockedRequestJson.mockReset();
  });

  afterEach(() => {
    cleanupTempEnv(env);
  });

  it('quiz com resposta_correta fora de opcoes é removido sem lançar exceção', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: payloadWithBadQuizItem(),
      usage: null,
    });

    // O pipeline hardenQuiz remove o item inválido; como sobra um item válido,
    // validateAndNormalize não lança e os artefatos são gravados normalmente.
    await expect(generateStudyGuide(env.db, env.vaultPath, zetelId)).resolves.not.toThrow();

    expect(existsSync(guiaEstudoHtmlPath(env.vaultPath, slug))).toBe(true);
  });

  it('resultado reporta traceability.totalItems > 0 mesmo sem hashes no payload', async () => {
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: payloadWithoutHashes(),
      usage: null,
    });

    const result = await generateStudyGuide(env.db, env.vaultPath, zetelId);

    // Itens sem hashes ficam flagged:true mas são contabilizados em totalItems
    expect(result.traceability.totalItems).toBeGreaterThan(0);
    expect(result.traceability.flaggedItems).toBeGreaterThan(0);
    // Não lança mesmo com 0% de cobertura
    expect(result.traceability.coveragePct).toBe(0);
  });

  it('itens sem hashes aparecem no sourceMap com flagged:true', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: payloadWithoutHashes(),
      usage: null,
    });

    await generateStudyGuide(env.db, env.vaultPath, zetelId);

    const { readStudyGuideSourceMap } = await import('@/lib/study-guide-service');
    const sourceMap = readStudyGuideSourceMap(env.vaultPath, slug);
    expect(sourceMap).not.toBeNull();

    const entries = Object.values(sourceMap!);
    const flagged = entries.filter((e) => e.flagged === true);
    expect(flagged.length).toBeGreaterThan(0);
  });
});
