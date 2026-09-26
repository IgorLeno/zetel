import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFile, processZetel } from '@/lib/ingestao-service';
import { zetelArtefatosDir } from '@/lib/paths';
import { requestJson, readApiKey } from '@/lib/openrouter';
import {
  generateStudyGuide,
  GUIA_ESTUDO_META_FILENAME,
  guiaEstudoHtmlPath,
  guiaEstudoSourcePath,
  readStudyGuideSourceMap,
} from '@/lib/study-guide-service';
import { threePagePdf } from '@/tests/helpers/pdf-fixture';
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
const mockedReadApiKey = vi.mocked(readApiKey);

function validGuiaPayload(): string {
  return JSON.stringify({
    titulo: 'Guia de Integração',
    subtitulo: 'Teste completo do pipeline',
    resumo: { texto: 'Resumo do pipeline de integração.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Conceito Central', conteudo: 'Descrição do conceito.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção Principal', conteudo: 'Conteúdo da seção.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'Termo', definicao: 'Definição do termo.' }],
    quiz: [
      {
        guide_block_id: 'quiz-1',
        pergunta: 'Qual é a resposta correta?',
        opcoes: ['Opção A', 'Opção B', 'Opção C'],
        resposta_correta: 'Opção A',
        explicacao: 'Porque A está correta.',
      },
    ],
    perguntas_zettelkasten: [
      { guide_block_id: 'zk-1', pergunta: 'Como este conceito se relaciona com outros?' },
    ],
  });
}

describe('Guia de Estudo — pipeline ponta-a-ponta', () => {
  let env: TempEnv;

  beforeEach(() => {
    env = makeTempEnv();
    mockedReadApiKey.mockReturnValue('test-api-key');
    mockedRequestJson.mockReset();
  });

  afterEach(() => {
    cleanupTempEnv(env);
  });

  it('processZetel → generateStudyGuide grava os três artefatos no vault', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    await generateStudyGuide(env.db, env.vaultPath, zetelId);

    expect(existsSync(guiaEstudoHtmlPath(env.vaultPath, slug))).toBe(true);
    expect(existsSync(join(zetelArtefatosDir(env.vaultPath, slug), GUIA_ESTUDO_META_FILENAME))).toBe(true);
    expect(existsSync(guiaEstudoSourcePath(env.vaultPath, slug))).toBe(true);
  });

  it('PDF anexado fica fora do Markdown enviado ao Guia de Estudo', async () => {
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath);
    const srcDir = mkdtempSync(join(tmpdir(), 'zetel-sg-pdf-'));
    try {
      const pdfPath = join(srcDir, 'Livro.pdf');
      writeFileSync(pdfPath, threePagePdf());
      addFile(env.db, env.vaultPath, zetelId, pdfPath);
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
    }
    processZetel(env.db, env.vaultPath, zetelId);
    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    await generateStudyGuide(env.db, env.vaultPath, zetelId);

    const prompt = JSON.stringify(mockedRequestJson.mock.calls[0]);
    expect(prompt).not.toContain('Livro.pdf');
    expect(prompt).not.toContain('%PDF');
  });

  it('HTML gerado contém o título do guia', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: null,
    });

    await generateStudyGuide(env.db, env.vaultPath, zetelId);

    const html = readFileSync(guiaEstudoHtmlPath(env.vaultPath, slug), 'utf8');
    expect(html).toContain('Guia de Integração');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('source map produzido pela ingestão + geração tem entradas válidas', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: null,
    });

    const result = await generateStudyGuide(env.db, env.vaultPath, zetelId);

    expect(result.model).toBeTruthy();
    expect(result.traceability.totalItems).toBeGreaterThan(0);

    const sourceMap = readStudyGuideSourceMap(env.vaultPath, slug);
    expect(sourceMap).not.toBeNull();
    expect(Object.keys(sourceMap!).length).toBeGreaterThan(0);
  });

  it('grava metadados com model, generatedAt e contagem de itens', async () => {
    const { zetelId, slug } = seedZetelWithFile(env.db, env.vaultPath);
    processZetel(env.db, env.vaultPath, zetelId);

    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
    });

    await generateStudyGuide(env.db, env.vaultPath, zetelId);

    const metaRaw = readFileSync(
      join(zetelArtefatosDir(env.vaultPath, slug), GUIA_ESTUDO_META_FILENAME),
      'utf8',
    );
    const meta = JSON.parse(metaRaw) as Record<string, unknown>;
    expect(meta.model).toBeTruthy();
    expect(meta.generatedAt).toBeTruthy();
    expect(typeof meta.counts).toBe('object');
  });
});
