import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  findStudyGuideSourceEntry,
  guiaEstudoSourcePath,
  readStudyGuideSourceMap,
} from '@/lib/study-guide-service';
import type { StudyGuideSourceMap } from '@/lib/study-guide-service';

const TMP = join(tmpdir(), `zetel-tests-${Date.now()}`);

afterAll(() => {
  try {
    const { rmSync } = require('node:fs');
    rmSync(TMP, { recursive: true, force: true });
  } catch { /* ignora */ }
});

function setupSourceMap(slug: string, map: StudyGuideSourceMap): void {
  const sourcePath = guiaEstudoSourcePath(TMP, slug);
  mkdirSync(join(TMP, 'zetels', slug, 'artefatos'), { recursive: true });
  writeFileSync(sourcePath, JSON.stringify(map), 'utf8');
}

describe('readStudyGuideSourceMap', () => {
  it('retorna null quando arquivo não existe', () => {
    expect(readStudyGuideSourceMap(TMP, 'slug-inexistente')).toBeNull();
  });

  it('lê e parseia JSON de source map válido', () => {
    const map: StudyGuideSourceMap = {
      'card-1': {
        source_file: 'doc.md',
        source_files: ['doc.md'],
        source_headings: ['Cap 1'],
        source_block_hashes: ['abc123'],
        page_indices: [0],
      },
    };
    setupSourceMap('slug-valid', map);
    const result = readStudyGuideSourceMap(TMP, 'slug-valid');
    expect(result).not.toBeNull();
    expect(result!['card-1'].source_file).toBe('doc.md');
  });

  it('retorna null para JSON corrompido', () => {
    const slug = 'slug-corrupt';
    mkdirSync(join(TMP, 'zetels', slug, 'artefatos'), { recursive: true });
    const sourcePath = guiaEstudoSourcePath(TMP, slug);
    writeFileSync(sourcePath, 'não-é-json', 'utf8');
    expect(readStudyGuideSourceMap(TMP, slug)).toBeNull();
  });
});

describe('findStudyGuideSourceEntry', () => {
  const map: StudyGuideSourceMap = {
    'sec-1': {
      source_file: 'a.md',
      source_files: ['a.md'],
      source_headings: ['Seção 1'],
      source_block_hashes: ['hash1'],
      page_indices: [2],
    },
  };

  it('encontra entrada pelo guideBlockId', () => {
    const entry = findStudyGuideSourceEntry(map, 'sec-1');
    expect(entry).not.toBeNull();
    expect(entry!.source_file).toBe('a.md');
  });

  it('retorna null para ID inexistente', () => {
    expect(findStudyGuideSourceEntry(map, 'nao-existe')).toBeNull();
  });

  it('retorna null quando sourceMap é null', () => {
    expect(findStudyGuideSourceEntry(null, 'sec-1')).toBeNull();
  });

  it('retorna null quando guideBlockId é null', () => {
    expect(findStudyGuideSourceEntry(map, null)).toBeNull();
  });
});
