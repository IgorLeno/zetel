import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeAnchorFactory,
  parseMarkdownForSegmentation,
  segmentFile,
  sha256,
} from '@/lib/ingestao-service';
import { runMigrations } from '@/lib/migrate';
import { zetelArtefatosDir } from '@/lib/paths';
import {
  generateStudyGuide,
  GUIA_ESTUDO_META_FILENAME,
  guiaEstudoHtmlPath,
  guiaEstudoSourcePath,
  readStudyGuideSourceMap,
} from '@/lib/study-guide-service';
import { requestJson, readApiKey } from '@/lib/openrouter';

vi.mock('@/lib/openrouter', () => ({
  readApiKey: vi.fn(() => 'test-api-key'),
  requestJson: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn(() => null),
}));

const mockedRequestJson = vi.mocked(requestJson);
const mockedReadApiKey = vi.mocked(readApiKey);

function validGuiaPayload(): string {
  return JSON.stringify({
    titulo: 'Guia de Teste',
    subtitulo: 'Subtítulo',
    resumo: { texto: 'Resumo do guia.' },
    cards: [{ guide_block_id: 'card-1', titulo: 'Conceito', conteudo: 'Descrição.' }],
    secoes: [{ guide_block_id: 'sec-1', titulo: 'Seção', conteudo: 'Conteúdo.' }],
    glossario: [{ guide_block_id: 'glo-1', termo: 'Termo', definicao: 'Definição.' }],
    quiz: [
      {
        guide_block_id: 'quiz-1',
        pergunta: 'Pergunta?',
        opcoes: ['A', 'B'],
        resposta_correta: 'A',
        explicacao: 'Porque A.',
      },
    ],
    perguntas_zettelkasten: [{ guide_block_id: 'zk-1', pergunta: 'Pergunta aberta?' }],
  });
}

function seedZetelWithPages(db: Database.Database, vaultPath: string): { zetelId: string; slug: string } {
  const zetelId = '00000000-0000-4000-8000-000000000001';
  const slug = 'guia-test';
  const now = new Date().toISOString();
  const md = '# Título\n\nConteúdo do documento para o guia.';

  db.prepare(
    `INSERT INTO zetels (id, slug, display_name, created_at, updated_at, reading_stale, last_built_at, trashed_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)`,
  ).run(zetelId, slug, 'Guia Test', now, now);

  db.prepare(
    `INSERT INTO zetel_files (id, zetel_id, filename, order_index, content_hash, size_bytes, last_seen_mtime, created_at, updated_at)
     VALUES (?, ?, ?, 0, NULL, NULL, NULL, ?, ?)`,
  ).run('file-1', zetelId, 'doc.md', now, now);

  const arquivosDir = join(vaultPath, 'zetels', slug, 'arquivos');
  mkdirSync(arquivosDir, { recursive: true });
  writeFileSync(join(arquivosDir, 'doc.md'), md, 'utf8');

  const tree = parseMarkdownForSegmentation(md);
  const pages = segmentFile(tree, 'doc', 1000, 0, makeAnchorFactory(new Set()));
  const insertPage = db.prepare(
    `INSERT INTO zetel_pages (zetel_id, page_index, heading, anchor, content_text, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    insertPage.run(zetelId, i, p.heading, p.anchor, p.contentText, sha256(p.contentText), now);
  }

  return { zetelId, slug };
}

describe('generateStudyGuide', () => {
  let db: Database.Database;
  let vaultPath: string;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    vaultPath = join(tmpdir(), `zetel-gen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(vaultPath, { recursive: true });
    mockedReadApiKey.mockReturnValue('test-api-key');
    mockedRequestJson.mockReset();
  });

  afterEach(() => {
    db.close();
    try {
      rmSync(vaultPath, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  });

  it('grava artefatos quando o modelo retorna JSON válido', async () => {
    const { zetelId, slug } = seedZetelWithPages(db, vaultPath);
    mockedRequestJson.mockResolvedValue({
      content: validGuiaPayload(),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    const result = await generateStudyGuide(db, vaultPath, zetelId);

    expect(result.model).toBeTruthy();
    expect(existsSync(guiaEstudoHtmlPath(vaultPath, slug))).toBe(true);
    expect(existsSync(join(zetelArtefatosDir(vaultPath, slug), GUIA_ESTUDO_META_FILENAME))).toBe(true);
    expect(existsSync(guiaEstudoSourcePath(vaultPath, slug))).toBe(true);
    const html = readFileSync(guiaEstudoHtmlPath(vaultPath, slug), 'utf8');
    expect(html).toContain('Guia de Teste');
    const sourceMap = readStudyGuideSourceMap(vaultPath, slug);
    expect(sourceMap).not.toBeNull();
    expect(Object.keys(sourceMap!).length).toBeGreaterThan(0);
  });

  it('lança quando o modelo retorna JSON inválido', async () => {
    const { zetelId } = seedZetelWithPages(db, vaultPath);
    mockedRequestJson.mockResolvedValue({
      content: 'isto não é json',
      usage: null,
    });

    await expect(generateStudyGuide(db, vaultPath, zetelId)).rejects.toThrow(/JSON válido/);
  });

  it('lança quando requestJson falha', async () => {
    const { zetelId } = seedZetelWithPages(db, vaultPath);
    mockedRequestJson.mockRejectedValue(new Error('OpenRouter: 503'));

    await expect(generateStudyGuide(db, vaultPath, zetelId)).rejects.toThrow(/503/);
  });

  it('lança quando o guia está incompleto (schema)', async () => {
    const { zetelId } = seedZetelWithPages(db, vaultPath);
    mockedRequestJson.mockResolvedValue({
      content: JSON.stringify({ titulo: 'Só título' }),
      usage: null,
    });

    await expect(generateStudyGuide(db, vaultPath, zetelId)).rejects.toThrow(/incompleto/);
  });

  it('lança quando não há páginas processadas', async () => {
    const zetelId = '00000000-0000-4000-8000-000000000099';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO zetels (id, slug, display_name, created_at, updated_at, reading_stale, last_built_at, trashed_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)`,
    ).run(zetelId, 'vazio', 'Vazio', now, now);

    await expect(generateStudyGuide(db, vaultPath, zetelId)).rejects.toThrow(/não tem páginas/);
  });
});
