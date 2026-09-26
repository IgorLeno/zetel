import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFile,
  listFiles,
  listPages,
  processPdfFiles,
  processZetel,
  removeFile,
} from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';
import { MAX_PDF_BYTES } from '@/lib/pdf-service';
import { renderZetel } from '@/lib/render-service';
import { createZetel } from '@/lib/zetel-service';
import { buildFixturePdf, threePagePdf } from '@/tests/helpers/pdf-fixture';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('ingestão de PDF — upload, processamento e remoção', () => {
  let env: TempEnv;
  let srcDir: string;
  let zetelId: string;
  let slug: string;

  const writeSrc = (name: string, data: Buffer | string) => {
    const p = join(srcDir, name);
    writeFileSync(p, data);
    return p;
  };
  const arquivo = (filename: string) => join(env.vaultPath, 'zetels', slug, 'arquivos', filename);
  const count = (sql: string, ...args: unknown[]) =>
    (env.db.prepare(sql).get(...args) as { n: number }).n;

  beforeEach(() => {
    env = makeTempEnv();
    env.db.pragma('foreign_keys = ON'); // igual ao singleton (lib/db.ts)
    srcDir = join(tmpdir(), `zetel-pdf-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(srcDir, { recursive: true });
    const zetel = createZetel(env.db, env.vaultPath, 'Termo');
    zetelId = zetel.id;
    slug = zetel.slug;
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    cleanupTempEnv(env);
    rmSync(srcDir, { recursive: true, force: true });
  });

  it('aceita .pdf e copia o original sem alteração', () => {
    const pdf = threePagePdf();
    const file = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', pdf));

    expect(file.filename).toBe('Livro.pdf');
    expect(file.pageCount).toBeNull();
    expect(file.extractionStatus).toBeNull();
    expect(sha(readFileSync(arquivo('Livro.pdf')))).toBe(sha(pdf));
  });

  it('rejeita outros formatos, PDF falso e PDF acima do limite', () => {
    expect(() => addFile(env.db, env.vaultPath, zetelId, writeSrc('a.txt', 'x'))).toThrow(
      'Apenas arquivos .md ou .pdf são aceitos.',
    );
    expect(() => addFile(env.db, env.vaultPath, zetelId, writeSrc('falso.pdf', '# md'))).toThrow(
      'O arquivo não é um PDF válido.',
    );
    const big = writeSrc('grande.pdf', '%PDF-1.4\n');
    truncateSync(big, MAX_PDF_BYTES + 1); // arquivo esparso: não aloca 50 MB
    expect(() => addFile(env.db, env.vaultPath, zetelId, big)).toThrow(/excede o limite de 50 MB/);
    expect(count('SELECT COUNT(*) AS n FROM zetel_files')).toBe(0);
  });

  it('processa PDF em pdf_pages/pdf_sections sem tocar no pipeline Markdown', async () => {
    const md = addFile(env.db, env.vaultPath, zetelId, writeSrc('notas.md', '# Notas\n\nTexto.\n'));
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));

    const mdResult = processZetel(env.db, env.vaultPath, zetelId);
    const pdfResult = await processPdfFiles(env.db, env.vaultPath, zetelId);

    expect(mdResult.filesProcessed).toBe(1);
    expect(listPages(env.db, zetelId).map((p) => p.heading)).toEqual(['Notas']);
    expect(pdfResult).toEqual({ filesProcessed: 1, pagesCount: 3, noText: 0, failed: 0 });

    const pages = env.db
      .prepare('SELECT page_number, char_count, content_hash FROM pdf_pages WHERE file_id = ? ORDER BY page_number')
      .all(pdf.id) as { page_number: number; char_count: number; content_hash: string }[];
    expect(pages.map((p) => p.page_number)).toEqual([1, 2, 3]);
    expect(pages.every((p) => p.char_count > 0 && /^[0-9a-f]{64}$/.test(p.content_hash))).toBe(true);
    expect(count('SELECT COUNT(*) AS n FROM pdf_sections WHERE file_id = ?', pdf.id)).toBe(3);

    const files = listFiles(env.db, env.vaultPath, zetelId);
    const listed = files.find((f) => f.id === pdf.id)!;
    expect(listed).toMatchObject({ pageCount: 3, extractionStatus: 'ok' });
    expect(listed.driftDetected).toBeFalsy();
    expect(listed.contentHash).toBe(sha(threePagePdf()));
    expect(files.find((f) => f.id === md.id)).toMatchObject({ pageCount: null, extractionStatus: null });

    // Documento Técnico segue funcionando com PDF anexado (PDF fora do pipeline Markdown).
    await expect(renderZetel(env.db, env.vaultPath, zetelId)).resolves.toMatchObject({ pagesCount: 1 });
    // Original intacto após processar.
    expect(sha(readFileSync(arquivo('Livro.pdf')))).toBe(sha(threePagePdf()));
  });

  it('reprocessamento é idempotente', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));
    const snapshot = () => ({
      pages: env.db.prepare('SELECT * FROM pdf_pages WHERE file_id = ? ORDER BY page_number').all(pdf.id),
      sections: env.db.prepare('SELECT * FROM pdf_sections WHERE file_id = ? ORDER BY ord').all(pdf.id),
    });

    await processPdfFiles(env.db, env.vaultPath, zetelId);
    const first = snapshot();
    await processPdfFiles(env.db, env.vaultPath, zetelId);

    expect(snapshot()).toEqual(first);
    expect(first.pages).toHaveLength(3);
  });

  it('PDF sem texto vira no_text sem quebrar o processamento dos demais', async () => {
    const scan = addFile(env.db, env.vaultPath, zetelId, writeSrc('scan.pdf', buildFixturePdf({ pages: [[], []] })));
    const ok = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));

    const result = await processPdfFiles(env.db, env.vaultPath, zetelId);

    expect(result).toEqual({ filesProcessed: 2, pagesCount: 5, noText: 1, failed: 0 });
    const status = (id: string) =>
      env.db.prepare('SELECT page_count, extraction_status FROM zetel_files WHERE id = ?').get(id);
    expect(status(scan.id)).toEqual({ page_count: 2, extraction_status: 'no_text' });
    expect(status(ok.id)).toEqual({ page_count: 3, extraction_status: 'ok' });
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages WHERE file_id = ? AND char_count = 0', scan.id)).toBe(2);
  });

  it('PDF corrompido vira failed e perde derivados antigos', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));
    await processPdfFiles(env.db, env.vaultPath, zetelId);
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages WHERE file_id = ?', pdf.id)).toBe(3);

    writeFileSync(arquivo('Livro.pdf'), '%PDF-1.4\ncorrompido');
    const result = await processPdfFiles(env.db, env.vaultPath, zetelId);

    expect(result).toEqual({ filesProcessed: 1, pagesCount: 0, noText: 0, failed: 1 });
    expect(env.db.prepare('SELECT page_count, extraction_status FROM zetel_files WHERE id = ?').get(pdf.id))
      .toEqual({ page_count: null, extraction_status: 'failed' });
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages WHERE file_id = ?', pdf.id)).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM pdf_sections WHERE file_id = ?', pdf.id)).toBe(0);
  });

  it('remover o arquivo apaga o original e os derivados (CASCADE)', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));
    await processPdfFiles(env.db, env.vaultPath, zetelId);

    removeFile(env.db, env.vaultPath, zetelId, pdf.id);

    expect(existsSync(arquivo('Livro.pdf'))).toBe(false);
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM pdf_sections')).toBe(0);
  });

  it('Zetel só com PDF processa pelo mesmo caminho da rota sem erro', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));

    expect(processZetel(env.db, env.vaultPath, zetelId)).toMatchObject({ pagesCount: 0, filesProcessed: 0 });
    await expect(processPdfFiles(env.db, env.vaultPath, zetelId)).resolves.toMatchObject({ pagesCount: 3 });
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages WHERE file_id = ?', pdf.id)).toBe(3);
  });

  it('arquivo removido durante a extração não é persistido', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));

    // A leitura é síncrona; a extração é assíncrona — a remoção cai no meio.
    const pending = processPdfFiles(env.db, env.vaultPath, zetelId);
    removeFile(env.db, env.vaultPath, zetelId, pdf.id);

    await expect(pending).resolves.toEqual({ filesProcessed: 0, pagesCount: 0, noText: 0, failed: 0 });
    expect(count('SELECT COUNT(*) AS n FROM pdf_pages')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM zetel_files')).toBe(0);
  });

  it('PDF trocado no vault acima do limite vira failed sem passar pelo parser', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));
    truncateSync(arquivo('Livro.pdf'), MAX_PDF_BYTES + 1);

    // Sem permissão de leitura: se o arquivo fosse lido, readFileSync lançaria
    // (drift). O stat continua funcionando, então só a checagem por stat passa.
    chmodSync(arquivo('Livro.pdf'), 0o000);

    await expect(processPdfFiles(env.db, env.vaultPath, zetelId)).resolves.toMatchObject({ failed: 1 });
    expect(
      env.db.prepare('SELECT extraction_status, size_bytes, content_hash FROM zetel_files WHERE id = ?').get(pdf.id),
    ).toEqual({ extraction_status: 'failed', size_bytes: MAX_PDF_BYTES + 1, content_hash: null });
  });

  it('PDF ausente no disco aborta antes de escrever (drift)', async () => {
    const pdf = addFile(env.db, env.vaultPath, zetelId, writeSrc('Livro.pdf', threePagePdf()));
    rmSync(arquivo('Livro.pdf'));

    await expect(processPdfFiles(env.db, env.vaultPath, zetelId)).rejects.toThrow(/não foi encontrado/);
    expect(env.db.prepare('SELECT extraction_status FROM zetel_files WHERE id = ?').get(pdf.id))
      .toEqual({ extraction_status: null });
  });

  it('logs só levam IDs, contagens e status — nunca texto ou nome do arquivo', async () => {
    addFile(env.db, env.vaultPath, zetelId, writeSrc('Segredo.pdf', threePagePdf()));
    const bad = addFile(env.db, env.vaultPath, zetelId, writeSrc('Ruim.pdf', threePagePdf()));
    writeFileSync(arquivo(bad.filename), '%PDF-1.4\ncorrompido');

    await processPdfFiles(env.db, env.vaultPath, zetelId);

    const calls = [...vi.mocked(logger.info).mock.calls, ...vi.mocked(logger.warn).mock.calls];
    expect(calls.length).toBeGreaterThan(0);
    const dump = JSON.stringify(calls);
    for (const leaked of ['Segredo', 'Ruim', 'entalpia', 'Termodinamica', 'Capitulo']) {
      expect(dump).not.toContain(leaked);
    }
    for (const [, meta] of calls) {
      for (const value of Object.values(meta ?? {})) {
        expect(['string', 'number']).toContain(typeof value);
      }
    }
  });
});
