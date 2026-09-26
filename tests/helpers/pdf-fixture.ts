/**
 * Gerador determinístico de PDFs mínimos para testes (sem dependência nova).
 *
 * Mesmo input → mesmos bytes: sem datas, IDs aleatórios ou metadados variáveis.
 * Texto usa Helvetica/WinAnsiEncoding; caracteres Latin-1 viram escapes octais.
 * Opções hostis (`javascript`) existem para provar que a extração não executa
 * nada vindo do PDF.
 */

export interface FixtureOutlineItem {
  title: string;
  /** Página de destino, 1-based. */
  page: number;
  children?: FixtureOutlineItem[];
}

export interface FixturePdfOptions {
  /** Linhas de texto por página; página com `[]` não tem camada de texto. */
  pages: string[][];
  outline?: FixtureOutlineItem[];
  /** JavaScript em OpenAction e numa anotação Link em cada página. */
  javascript?: string;
}

function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (code >= 0x20 && code < 0x7f) out += ch;
    else if (code <= 0xff) out += `\\${code.toString(8).padStart(3, '0')}`;
    else throw new Error('pdf-fixture: somente Latin-1 é suportado');
  }
  return `${out})`;
}

export function buildFixturePdf(opts: FixturePdfOptions): Buffer {
  const objects: string[] = [];
  const alloc = (): number => {
    objects.push('');
    return objects.length;
  };
  const set = (n: number, body: string) => {
    objects[n - 1] = body;
  };

  const catalog = alloc();
  const pagesObj = alloc();
  const font = alloc();
  set(font, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const jsAction = opts.javascript
    ? `<< /S /JavaScript /JS ${pdfString(opts.javascript)} >>`
    : null;

  const pageRefs: number[] = [];
  for (const lines of opts.pages) {
    const page = alloc();
    const contents = alloc();
    pageRefs.push(page);

    const ops = lines.length
      ? ['BT', '/F1 12 Tf', '72 720 Td', ...lines.flatMap((l, i) => [
          ...(i > 0 ? ['0 -16 Td'] : []),
          `${pdfString(l)} Tj`,
        ]), 'ET'].join('\n')
      : '';
    set(contents, `<< /Length ${Buffer.byteLength(ops, 'latin1')} >>\nstream\n${ops}\nendstream`);

    let annots = '';
    if (jsAction) {
      const annot = alloc();
      set(annot, `<< /Type /Annot /Subtype /Link /Rect [72 72 200 100] /Border [0 0 0] /A ${jsAction} >>`);
      annots = ` /Annots [${annot} 0 R]`;
    }
    set(
      page,
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R${annots} >>`,
    );
  }
  set(
    pagesObj,
    `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`,
  );

  let outlinesRef: number | null = null;
  if (opts.outline?.length) {
    outlinesRef = alloc();
    const buildLevel = (items: FixtureOutlineItem[], parent: number): { first: number; last: number; count: number } => {
      const refs = items.map(() => alloc());
      let count = 0;
      items.forEach((item, i) => {
        let extra = '';
        if (item.children?.length) {
          const sub = buildLevel(item.children, refs[i]!);
          extra = ` /First ${sub.first} 0 R /Last ${sub.last} 0 R /Count ${sub.count}`;
          count += sub.count;
        }
        const prev = i > 0 ? ` /Prev ${refs[i - 1]} 0 R` : '';
        const next = i < refs.length - 1 ? ` /Next ${refs[i + 1]} 0 R` : '';
        set(
          refs[i]!,
          `<< /Title ${pdfString(item.title)} /Parent ${parent} 0 R${prev}${next} ` +
            `/Dest [${pageRefs[item.page - 1]} 0 R /Fit]${extra} >>`,
        );
        count += 1;
      });
      return { first: refs[0]!, last: refs[refs.length - 1]!, count };
    };
    const top = buildLevel(opts.outline, outlinesRef);
    set(outlinesRef, `<< /Type /Outlines /First ${top.first} 0 R /Last ${top.last} 0 R /Count ${top.count} >>`);
  }

  set(
    catalog,
    `<< /Type /Catalog /Pages ${pagesObj} 0 R` +
      (outlinesRef ? ` /Outlines ${outlinesRef} 0 R /PageMode /UseOutlines` : '') +
      (jsAction ? ` /OpenAction ${jsAction}` : '') +
      ' >>',
  );

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Fixture canônica da tarefa 002: 3 páginas com texto + outline aninhado. */
export function threePagePdf(): Buffer {
  return buildFixturePdf({
    pages: [
      ['Capitulo 1: Termodinamica', 'Energia interna e calor.'],
      ['A entalpia H = U + pV.', 'Processos isobaricos.'],
      ['Capitulo 2: Entropia', 'Segunda lei.'],
    ],
    outline: [
      { title: 'Capitulo 1', page: 1, children: [{ title: 'Entalpia', page: 2 }] },
      { title: 'Capitulo 2', page: 3 },
    ],
  });
}
