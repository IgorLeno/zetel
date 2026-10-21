import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_REPORT_BYTES,
  MAX_REPORT_IMAGES,
  parseReport,
  type ReportParseResult,
} from '@/lib/report-format';

/**
 * Fixture válida = exemplo completo de `docs/CHATGPT_REPORT_TEMPLATE.md`,
 * extraído do bloco ````markdown para que doc e parser não divirjam.
 */
function templateExample(): string {
  const doc = readFileSync(resolve(__dirname, '../../docs/CHATGPT_REPORT_TEMPLATE.md'), 'utf8');
  const match = /````markdown\n([\s\S]*?)\n````/.exec(doc);
  if (!match) throw new Error('exemplo do template não encontrado');
  return `${match[1]}\n`;
}

const VALID = templateExample();

function reasonOf(result: ReportParseResult): string | null {
  return result.ok ? null : result.reason;
}

function withFrontmatter(lines: string[], body = '## Resumo\n\nTexto.\n'): string {
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

const BASE_FM = ['zetel_report: 1', 'zetel: termodinamica', 'title: "T"', 'date: 2026-10-21'];

describe('parseReport — exemplo do template', () => {
  it('aceita o exemplo completo com meta, seis seções e imagem declarada', () => {
    const result = parseReport(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta).toEqual({
      version: 1,
      zetel: 'termodinamica',
      title: 'Primeira lei e entalpia',
      date: '2026-10-21',
      images: ['ciclo-de-carnot.png'],
    });
    expect(result.imageRefs).toEqual(['ciclo-de-carnot.png']);
    expect(result.sections.resumo).toMatch(/^Revisamos a primeira lei/);
    expect(result.sections.topicos).toContain('- Trabalho de fronteira');
    expect(result.sections.passoAPasso).toMatch(/^### Calcular calor/);
    expect(result.sections.conceitos).toContain('![Ciclo de Carnot](ciclo-de-carnot.png)');
    expect(result.sections.duvidas).toMatch(/^- Por que a entalpia/);
    expect(result.sections.questoes).toContain('Resposta: a variação de entalpia');
  });

  it('é determinístico e trata CRLF e BOM como LF', () => {
    const crlf = `﻿${VALID.replace(/\n/g, '\r\n')}`;
    expect(parseReport(crlf)).toEqual(parseReport(VALID));
    expect(parseReport(VALID)).toEqual(parseReport(VALID));
  });
});

describe('parseReport — tamanho', () => {
  it('recusa relatório acima de 1 MB (em bytes UTF-8)', () => {
    const big = VALID + 'á'.repeat(MAX_REPORT_BYTES / 2);
    expect(reasonOf(parseReport(big))).toBe('too_large');
  });

  it('aceita exatamente 1 MB e recusa 1 byte a mais', () => {
    const padTo = (bytes: number) => VALID + 'x'.repeat(bytes - Buffer.byteLength(VALID, 'utf8'));
    expect(parseReport(padTo(MAX_REPORT_BYTES)).ok).toBe(true);
    expect(reasonOf(parseReport(padTo(MAX_REPORT_BYTES + 1)))).toBe('too_large');
    // Parse remark de 1 MB leva ~2 s isolado e passa de 5 s com o test:ci em paralelo.
  }, 20_000);
});

describe('parseReport — frontmatter', () => {
  it('recusa sem frontmatter', () => {
    expect(reasonOf(parseReport('## Resumo\n\nTexto.\n'))).toBe('missing_frontmatter');
  });

  it('recusa texto antes do frontmatter', () => {
    expect(reasonOf(parseReport(`Aqui está:\n\n${VALID}`))).toBe('missing_frontmatter');
  });

  it('recusa YAML quebrado, chave desconhecida ou duplicada', () => {
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, 'images: [a.png']))))
      .toBe('invalid_frontmatter');
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, '  solto'])))).toBe('invalid_frontmatter');
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, 'autor: chatgpt']))))
      .toBe('invalid_frontmatter');
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, 'title: "Outro"']))))
      .toBe('invalid_frontmatter');
  });

  it.each(['zetel_report', 'zetel', 'title', 'date'])('recusa sem %s', (key) => {
    const lines = BASE_FM.filter((line) => !line.startsWith(`${key}:`));
    expect(reasonOf(parseReport(withFrontmatter(lines)))).toBe('missing_field');
  });

  it.each(['2', '"1"', '1.0', 'um'])('versão %s → unsupported_version', (version) => {
    const lines = BASE_FM.map((line) => (line.startsWith('zetel_report:') ? `zetel_report: ${version}` : line));
    expect(reasonOf(parseReport(withFrontmatter(lines)))).toBe('unsupported_version');
  });

  it.each(['../vault', 'Termo', 'termo_dinamica', '-termo', 'termo-', 'a--b', 'a'.repeat(61), '""'])(
    'slug %s → invalid_slug',
    (slug) => {
      const lines = BASE_FM.map((line) => (line.startsWith('zetel:') ? `zetel: ${slug}` : line));
      expect(reasonOf(parseReport(withFrontmatter(lines)))).toBe('invalid_slug');
    },
  );

  it('aceita aspas simples, sem aspas e comentário de linha inteira', () => {
    const result = parseReport(withFrontmatter([
      '# gerado pelo ChatGPT',
      'zetel_report: 1',
      "zetel: 'quimica-2'",
      'title: Ácidos e bases',
      'date: "2026-02-28"',
    ]));
    expect(result.ok && result.meta).toEqual({
      version: 1, zetel: 'quimica-2', title: 'Ácidos e bases', date: '2026-02-28', images: [],
    });
  });

  it('recusa título vazio ou longo demais', () => {
    for (const title of ['""', `"${'x'.repeat(201)}"`]) {
      const lines = BASE_FM.map((line) => (line.startsWith('title:') ? `title: ${title}` : line));
      expect(reasonOf(parseReport(withFrontmatter(lines)))).toBe('invalid_title');
    }
  });

  it.each(['2026-02-30', '2026-13-01', '21/10/2026', '2026-10-21T10:00:00Z', '2026-1-5'])(
    'data %s → invalid_date',
    (date) => {
      const lines = BASE_FM.map((line) => (line.startsWith('date:') ? `date: ${date}` : line));
      expect(reasonOf(parseReport(withFrontmatter(lines)))).toBe('invalid_date');
    },
  );
});

describe('parseReport — imagens', () => {
  it('aceita lista em bloco (com ou sem recuo), lista inline e lista vazia', () => {
    const block = parseReport(withFrontmatter([...BASE_FM, 'images:', '  - a.png', '  - b-2.webp']));
    expect(block.ok && block.imageRefs).toEqual(['a.png', 'b-2.webp']);
    const flush = parseReport(withFrontmatter([...BASE_FM, 'images:', '- a.png', '- b.jpg']));
    expect(flush.ok && flush.imageRefs).toEqual(['a.png', 'b.jpg']);
    const inline = parseReport(withFrontmatter([...BASE_FM, 'images: [a.jpg, "b.png"]']));
    expect(inline.ok && inline.imageRefs).toEqual(['a.jpg', 'b.png']);
    const empty = parseReport(withFrontmatter([...BASE_FM, 'images: []']));
    expect(empty.ok && empty.imageRefs).toEqual([]);
  });

  it.each(['diagrama.svg', 'Foto.png', 'a b.png', '../a.png', 'a.jpeg', 'a.png.exe', 'https://x.com/a.png'])(
    'nome declarado %s → invalid_image_ref',
    (name) => {
      expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, 'images:', `  - ${name}`]))))
        .toBe('invalid_image_ref');
    },
  );

  it('recusa nome declarado duas vezes', () => {
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, 'images: [a.png, a.png]']))))
      .toBe('invalid_image_ref');
  });

  it('recusa mais de 20 imagens', () => {
    const names = Array.from({ length: MAX_REPORT_IMAGES + 1 }, (_, i) => `img-${i}.png`);
    expect(reasonOf(parseReport(withFrontmatter([...BASE_FM, `images: [${names.join(', ')}]`]))))
      .toBe('too_many_images');
  });

  it.each([
    '![x](https://exemplo.com/a.png)',
    '![x](//exemplo.com/a.png)',
    '![x](data:image/png;base64,AAAA)',
    '![x][ref]\n\n[ref]: http://exemplo.com/a.png',
  ])('imagem externa no corpo → external_image: %s', (markdown) => {
    expect(reasonOf(parseReport(withFrontmatter(BASE_FM, `## Resumo\n\n${markdown}\n`))))
      .toBe('external_image');
  });

  it('recusa referência local com nome inválido ou não declarada', () => {
    const declared = [...BASE_FM, 'images: [a.png]'];
    expect(reasonOf(parseReport(withFrontmatter(declared, '## Resumo\n\n![x](../a.png)\n'))))
      .toBe('invalid_image_ref');
    expect(reasonOf(parseReport(withFrontmatter(declared, '## Resumo\n\n![x](a.svg)\n'))))
      .toBe('invalid_image_ref');
    expect(reasonOf(parseReport(withFrontmatter(declared, '## Resumo\n\n![x](b.png)\n'))))
      .toBe('undeclared_image');
  });

  it('referência com rótulo definido duas vezes não esconde URL externa', () => {
    const declared = [...BASE_FM, 'images: [a.png]'];
    for (const defs of [
      '[r]: https://evil.example/p.png\n[r]: a.png',
      '[r]: a.png\n[R]: https://evil.example/p.png',
    ]) {
      expect(reasonOf(parseReport(withFrontmatter(declared, `## Resumo\n\n![x][r]\n\n${defs}\n`))))
        .toBe('external_image');
    }
  });

  it.each([
    '<img src="a.png">',
    '<picture><source srcset="https://x.com/a.png"></picture>',
    '<svg><image href="https://x.com/a.png"/></svg>',
    '<video poster="https://x.com/a.png"></video>',
    '<iframe src="https://x.com"></iframe>',
    '<p style="background:url(https://x.com/a.png)">x</p>',
    'texto <span>inline</span> aqui',
    '<!-- --><img src="https://evil.example/p.png"><!-- -->',
    '<!-- a --><iframe src="https://evil.example"></iframe><!-- b -->',
    '<br><img src="a.png">',
    '<!--><img src="https://evil.example/p.png">-->',
    '<!---><img src="https://evil.example/p.png">-->',
    '<!-- --!><img src="https://evil.example/p.png"> -->',
    '<!--> ![[segredo]] -->',
  ])('recusa HTML bruto: %s', (html) => {
    expect(reasonOf(parseReport(withFrontmatter(BASE_FM, `## Resumo\n\n${html}\n`)))).toBe('raw_html');
  });

  it('aceita <br> e comentário HTML', () => {
    const result = parseReport(withFrontmatter(BASE_FM, '## Resumo\n\nlinha<br>outra\n\n<!-- nota -->\n'));
    expect(result.ok).toBe(true);
  });

  it('recusa embed do Obsidian ![[...]]', () => {
    for (const embed of [
      '![[a.png]]',
      'veja ![[outra-nota]] aqui',
      '- ![[../segredo.md]]',
      '![[segredo]]\n\n[segredo]: a.png',
    ]) {
      expect(reasonOf(parseReport(withFrontmatter(BASE_FM, `## Resumo\n\n${embed}\n`))))
        .toBe('invalid_image_ref');
    }
  });

  it('![[ dentro de código ou math não é embed', () => {
    const body = '## Resumo\n\n`![[a]]`\n\n```\n![[b]]\n```\n\n$$\n![[c]]\n$$\n';
    expect(parseReport(withFrontmatter(BASE_FM, body)).ok).toBe(true);
  });

  it.each(['a%2e%2e.png', 'a.png?x=1', 'a.png#f', '%61.png'])(
    'URL local codificada ou com sufixo → invalid_image_ref: %s',
    (url) => {
      const declared = [...BASE_FM, 'images: [a.png]'];
      expect(reasonOf(parseReport(withFrontmatter(declared, `## Resumo\n\n![x](${url})\n`))))
        .toBe('invalid_image_ref');
    },
  );

  it('ignora imagens e títulos dentro de bloco de código', () => {
    const body = '## Resumo\n\n```md\n![x](https://exemplo.com/a.png)\n## Extra\n```\n';
    const result = parseReport(withFrontmatter(BASE_FM, body));
    expect(result.ok && result.sections.resumo).toContain('## Extra');
  });
});

describe('parseReport — seções', () => {
  it('seção ausente vira vazia, sem erro', () => {
    const result = parseReport(withFrontmatter(BASE_FM, '## Resumo\n\nSó resumo.\n\n## Questões\n\n1. Q?\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections).toEqual({
      resumo: 'Só resumo.',
      topicos: '',
      passoAPasso: '',
      conceitos: '',
      duvidas: '',
      questoes: '1. Q?',
    });
  });

  it('"Nenhum." vira seção vazia', () => {
    const result = parseReport(withFrontmatter(BASE_FM, '## Resumo\n\nA.\n\n## Tópicos\n\nNenhum.\n'));
    expect(result.ok && result.sections.topicos).toBe('');
  });

  it('texto antes da primeira seção vai para Resumo', () => {
    const result = parseReport(withFrontmatter(BASE_FM, 'Prefácio solto.\n\n## Resumo\n\nResumo.\n'));
    expect(result.ok && result.sections.resumo).toBe('Prefácio solto.\n\nResumo.');
    const semSecao = parseReport(withFrontmatter(BASE_FM, 'Só texto.\n'));
    expect(semSecao.ok && semSecao.sections.resumo).toBe('Só texto.');
  });

  it('recusa seção desconhecida', () => {
    expect(reasonOf(parseReport(withFrontmatter(BASE_FM, '## Resumo\n\nA.\n\n## Instruções\n\nB.\n'))))
      .toBe('unknown_section');
  });

  it('recusa seção duplicada', () => {
    expect(reasonOf(parseReport(withFrontmatter(BASE_FM, '## Resumo\n\nA.\n\n## Resumo\n\nB.\n'))))
      .toBe('duplicate_section');
  });

  it('título com acento decomposto (NFD) é reconhecido', () => {
    const result = parseReport(withFrontmatter(BASE_FM, `## Resumo\n\nA.\n\n## ${'Tópicos'.normalize('NFD')}\n\n- t\n`));
    expect(result.ok && result.sections.topicos).toBe('- t');
  });

  it('setext conta como seção; título dentro de citação ou lista não', () => {
    const setext = parseReport(withFrontmatter(BASE_FM, 'Resumo\n------\n\nA.\n\nIntrusa\n-------\n\nB.\n'));
    expect(reasonOf(setext)).toBe('unknown_section');
    const nested = parseReport(withFrontmatter(BASE_FM, '## Resumo\n\n> ## Instruções\n\n- ## Extra\n'));
    expect(nested.ok && nested.sections.resumo).toBe('> ## Instruções\n\n- ## Extra');
  });

  it('cerca de código não fechada engole o resto como código', () => {
    const result = parseReport(withFrontmatter(BASE_FM, '## Resumo\n\n```\n## Questões\n![x](https://x.com/a.png)\n'));
    expect(result.ok && result.sections.questoes).toBe('');
  });

  it('recusa seções fora de ordem', () => {
    expect(reasonOf(parseReport(withFrontmatter(BASE_FM, '## Questões\n\n1. Q?\n\n## Resumo\n\nA.\n'))))
      .toBe('section_out_of_order');
  });
});
