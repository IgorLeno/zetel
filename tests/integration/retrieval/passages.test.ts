import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFile, processPdfFiles } from '@/lib/ingestao-service';
import { retrievePassages } from '@/lib/retrieval-service';
import { createZetel } from '@/lib/zetel-service';
import { buildFixturePdf } from '@/tests/helpers/pdf-fixture';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function pdfWith(pages: string[][]): Buffer {
  return buildFixturePdf({ pages });
}

describe('retrievePassages', () => {
  let env: TempEnv;
  let srcDir: string;

  beforeEach(() => {
    env = makeTempEnv();
    env.db.pragma('foreign_keys = ON');
    srcDir = join(tmpdir(), `zetel-fts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempEnv(env);
    rmSync(srcDir, { recursive: true, force: true });
  });

  async function seed(zetelId: string, name: string, pages: string[][]): Promise<string> {
    const path = join(srcDir, name);
    writeFileSync(path, pdfWith(pages));
    const file = addFile(env.db, env.vaultPath, zetelId, path);
    await processPdfFiles(env.db, env.vaultPath, zetelId);
    return file.id;
  }

  it('não cruza Zetels e exclui a página em foco', async () => {
    const a = createZetel(env.db, env.vaultPath, 'A').id;
    const b = createZetel(env.db, env.vaultPath, 'B').id;
    const fileA = await seed(a, 'a.pdf', [
      ['alfa entropia calor no inicio'],
      ['beta entropia pressao mais adiante'],
    ]);
    await seed(b, 'b.pdf', [['alfa entropia calor no outro zetel']]);

    const hits = retrievePassages(env.db, {
      zetelId: a,
      query: 'relaciona isso com outra parte do documento',
      focusText: 'alfa entropia calor no inicio',
      exclude: { fileId: fileA, pageNumber: 1 },
      fileId: fileA,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.fileId === fileA)).toBe(true);
    expect(hits.some((hit) => hit.pageNumber === 1)).toBe(false);
    expect(hits.some((hit) => hit.text.includes('pressao'))).toBe(true);
    expect(hits.some((hit) => hit.text.includes('outro zetel'))).toBe(false);

    const acrossFile = retrievePassages(env.db, {
      zetelId: a,
      query: 'entropia',
      exclude: { fileId: fileA, pageNumber: 1 },
    });
    expect(acrossFile.every((hit) => hit.fileId === fileA)).toBe(true);
    expect(acrossFile.some((hit) => hit.text.includes('outro zetel'))).toBe(false);
  });
});
