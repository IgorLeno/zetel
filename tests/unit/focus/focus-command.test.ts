import { describe, expect, it } from 'vitest';
import { nextSessionFocus, parseFocusCommand } from '@/lib/focus';

describe('parseFocusCommand', () => {
  it('reconhece as regras PT-BR fechadas do plano', () => {
    expect(parseFocusCommand('quero só dessa página')).toMatchObject({ onlyThisPage: true });
    expect(parseFocusCommand('veja o capítulo inteiro')).toMatchObject({ scope: 'section' });
    expect(parseFocusCommand('o livro inteiro, por favor')).toMatchObject({ scope: 'document' });
    expect(parseFocusCommand('relaciona com o começo')).toMatchObject({ hint: 'beginning' });
    expect(parseFocusCommand('e a última parte?')).toMatchObject({ hint: 'end' });
    expect(parseFocusCommand('o que é entalpia?')).toEqual({
      onlyThisPage: false,
      scope: null,
      hint: null,
    });
  });
});

describe('nextSessionFocus', () => {
  const pdf = { fileId: 'pdf-1', pageNumber: 4 };

  it('persiste documento inteiro e o hint de começo na sessão', () => {
    const document = nextSessionFocus({
      current: { scope: 'page', fileId: 'pdf-1', pageNumber: 4 },
      command: parseFocusCommand('considere o documento inteiro'),
      pdf,
      markdownPage: null,
    });
    expect(document).toEqual({ scope: 'document', fileId: 'pdf-1', pageNumber: null });

    const beginning = nextSessionFocus({
      current: document,
      command: parseFocusCommand('volta para o começo'),
      pdf,
      markdownPage: null,
    });
    expect(beginning).toEqual({
      scope: 'document',
      fileId: 'pdf-1',
      pageNumber: null,
      hint: 'beginning',
    });
  });
});
