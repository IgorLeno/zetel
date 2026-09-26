import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractPdf,
  isPdfFilename,
  PDF_EXTRACTION_LIMITS,
  PdfLimitError,
  looksLikePdf,
  normalizePageText,
} from '@/lib/pdf-service';
import { buildFixturePdf, threePagePdf } from '@/tests/helpers/pdf-fixture';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('extractPdf', () => {
  it('extrai 3 páginas 1-based com texto, sha256 e char_count', async () => {
    const result = await extractPdf(threePagePdf());

    expect(result.status).toBe('ok');
    expect(result.pageCount).toBe(3);
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages.map((p) => p.contentText)).toEqual([
      'Capitulo 1: Termodinamica\nEnergia interna e calor.',
      'A entalpia H = U + pV.\nProcessos isobaricos.',
      'Capitulo 2: Entropia\nSegunda lei.',
    ]);
    for (const p of result.pages) {
      expect(p.contentHash).toBe(sha(p.contentText));
      expect(p.charCount).toBe(p.contentText.length);
    }
  });

  it('converte o outline aninhado em seções com nível e intervalo de páginas', async () => {
    const { sections } = await extractPdf(threePagePdf());

    expect(sections).toEqual([
      { ord: 0, title: 'Capitulo 1', level: 1, startPage: 1, endPage: 2 },
      { ord: 1, title: 'Entalpia', level: 2, startPage: 2, endPage: 2 },
      { ord: 2, title: 'Capitulo 2', level: 1, startPage: 3, endPage: 3 },
    ]);
  });

  it('é determinística: mesmo PDF → mesmos hashes', async () => {
    const a = await extractPdf(threePagePdf());
    const b = await extractPdf(threePagePdf());
    expect(b.pages.map((p) => p.contentHash)).toEqual(a.pages.map((p) => p.contentHash));
  });

  it('PDF sem outline não gera seções', async () => {
    const result = await extractPdf(buildFixturePdf({ pages: [['Uma pagina.']] }));
    expect(result.sections).toEqual([]);
    expect(result.pageCount).toBe(1);
  });

  it('PDF sem camada de texto retorna no_text com uma linha vazia por página', async () => {
    const result = await extractPdf(buildFixturePdf({ pages: [[], []] }));

    expect(result.status).toBe('no_text');
    expect(result.pageCount).toBe(2);
    expect(result.pages).toHaveLength(2);
    for (const p of result.pages) {
      expect(p.contentText).toBe('');
      expect(p.charCount).toBe(0);
      expect(p.contentHash).toBe(sha(''));
    }
  });

  it('preserva acentos Latin-1 (WinAnsi) em NFC', async () => {
    const result = await extractPdf(buildFixturePdf({ pages: [['Termodinâmica é ação.']] }));
    expect(result.pages[0]!.contentText).toBe('Termodinâmica é ação.');
  });

  it('não executa JavaScript de OpenAction nem de anotações', async () => {
    const g = globalThis as { __zetelPdfPwned?: unknown };
    delete g.__zetelPdfPwned;
    const pdf = buildFixturePdf({
      pages: [['Texto seguro.']],
      javascript: 'globalThis.__zetelPdfPwned = true; app.alert("x");',
    });

    const result = await extractPdf(pdf);

    expect(result.status).toBe('ok');
    expect(result.pages[0]!.contentText).toBe('Texto seguro.');
    expect(result.pages[0]!.contentText).not.toContain('__zetelPdfPwned');
    expect(g.__zetelPdfPwned).toBeUndefined();
  });

  it('estourar limite de páginas, texto ou tempo lança PdfLimitError', async () => {
    const pdf = threePagePdf();
    const limited = (over: Partial<typeof PDF_EXTRACTION_LIMITS>) =>
      extractPdf(pdf, { ...PDF_EXTRACTION_LIMITS, ...over });

    await expect(limited({ maxPages: 2 })).rejects.toThrow(PdfLimitError);
    await expect(limited({ maxTotalChars: 60 })).rejects.toThrow(/maxTotalChars/);
    await expect(limited({ timeoutMs: 0 })).rejects.toThrow(/timeoutMs/);
    await expect(limited({ maxPages: 3, maxTotalChars: 1000 })).resolves.toMatchObject({ pageCount: 3 });
  });

  it('lança em bytes que não são PDF válido', async () => {
    await expect(extractPdf(Buffer.from('%PDF-1.4\nlixo sem xref'))).rejects.toThrow();
  });
});

describe('helpers', () => {
  it('isPdfFilename ignora caixa', () => {
    expect(isPdfFilename('Livro.PDF')).toBe(true);
    expect(isPdfFilename('nota.md')).toBe(false);
  });

  it('looksLikePdf exige %PDF- no começo do arquivo', () => {
    expect(looksLikePdf(threePagePdf())).toBe(true);
    expect(looksLikePdf(Buffer.from('# markdown'))).toBe(false);
  });

  it('normalizePageText remove controles e colapsa espaços', () => {
    expect(normalizePageText('  a\u0000b   c \r\n\n\n\nd\t\te  ')).toBe('ab c\n\nd e');
  });
});
