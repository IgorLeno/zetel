import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPages, processZetel } from '@/lib/ingestao-service';
import { cleanupTempEnv, makeTempEnv, seedZetelWithFile, type TempEnv } from '@/tests/helpers/temp-env';

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));

describe('processZetel — integration', () => {
  let env: TempEnv;

  beforeEach(() => {
    env = makeTempEnv();
  });

  afterEach(() => {
    cleanupTempEnv(env);
  });

  it('ingesta um arquivo Markdown e grava páginas no SQLite com hash e anchor', () => {
    const content =
      '# Fundamentos\n\nConceitos básicos de álgebra linear.\n\n' +
      '## Vetores\n\nUm vetor é um elemento de um espaço vetorial.\n';
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath, { content });

    const result = processZetel(env.db, env.vaultPath, zetelId);

    expect(result.filesProcessed).toBe(1);
    expect(result.pagesCount).toBeGreaterThanOrEqual(1);

    const pages = listPages(env.db, zetelId);
    expect(pages).toHaveLength(result.pagesCount);

    for (const page of pages) {
      expect(page.contentHash).toBeTruthy();
      expect(page.anchor).toBeTruthy();
      expect(page.contentText).toBeTruthy();
      expect(typeof page.pageIndex).toBe('number');
    }
  });

  it('anchors são únicos dentro do mesmo zetel após ingestão', () => {
    const content =
      '# Seção Um\n\nConteúdo um.\n\n' +
      '# Seção Dois\n\nConteúdo dois.\n\n' +
      '# Seção Três\n\nConteúdo três.\n';
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath, { content });

    processZetel(env.db, env.vaultPath, zetelId);

    const pages = listPages(env.db, zetelId);
    const anchors = pages.map((p) => p.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('é idempotente: reprocessar o mesmo arquivo produz os mesmos hashes e anchors', () => {
    const content = '# Título\n\nConteúdo imutável.\n';
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath, { content });

    processZetel(env.db, env.vaultPath, zetelId);
    const pages1 = listPages(env.db, zetelId);

    processZetel(env.db, env.vaultPath, zetelId);
    const pages2 = listPages(env.db, zetelId);

    expect(pages1).toHaveLength(pages2.length);
    for (let i = 0; i < pages1.length; i++) {
      expect(pages1[i]!.contentHash).toBe(pages2[i]!.contentHash);
      expect(pages1[i]!.anchor).toBe(pages2[i]!.anchor);
      expect(pages1[i]!.heading).toBe(pages2[i]!.heading);
    }
  });

  it('page_index começa em 0 e é contínuo', () => {
    const content =
      '# Página Um\n\nConteúdo.\n\n# Página Dois\n\nConteúdo.\n\n# Página Três\n\nConteúdo.\n';
    const { zetelId } = seedZetelWithFile(env.db, env.vaultPath, { content });

    processZetel(env.db, env.vaultPath, zetelId);

    const pages = listPages(env.db, zetelId);
    const indexes = pages.map((p) => p.pageIndex);
    expect(indexes[0]).toBe(0);
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBe(i);
    }
  });

  it('lança quando o arquivo registrado não existe no vault', () => {
    const { zetelId, fileId } = seedZetelWithFile(env.db, env.vaultPath);

    const { slug } = env.db
      .prepare('SELECT slug FROM zetels WHERE id = ?')
      .get(zetelId) as { slug: string };
    const { filename } = env.db
      .prepare('SELECT filename FROM zetel_files WHERE id = ?')
      .get(fileId) as { filename: string };

    rmSync(join(env.vaultPath, 'zetels', slug, 'arquivos', filename), { force: true });

    expect(() => processZetel(env.db, env.vaultPath, zetelId)).toThrow();
  });
});
