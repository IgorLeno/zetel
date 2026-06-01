import { describe, expect, it } from 'vitest';
import {
  extractNoteSuggestion,
  NOTE_MARK_END,
  NOTE_MARK_START,
} from '@/lib/chat-prompt';

describe('extractNoteSuggestion', () => {
  it('retorna suggestion null quando marcador ausente', () => {
    const { narrative, suggestion } = extractNoteSuggestion('Texto sem marcador algum.');
    expect(narrative).toBe('Texto sem marcador algum.');
    expect(suggestion).toBeNull();
  });

  it('extrai nota do tipo rapida válida', () => {
    const json = JSON.stringify({
      tipo: 'rapida',
      titulo: 'Conceito X',
      corpo: 'Explicação sobre X.',
      justificativa: 'nunca deve sair',
    });
    const full = `Narrativa do assistente.\n${NOTE_MARK_START}${json}${NOTE_MARK_END}`;
    const { narrative, suggestion } = extractNoteSuggestion(full);
    expect(narrative).toBe('Narrativa do assistente.');
    expect(suggestion).not.toBeNull();
    expect(suggestion!.tipo).toBe('rapida');
    expect(suggestion!.titulo).toBe('Conceito X');
    expect(suggestion!.corpo).toBe('Explicação sobre X.');
    // justificativa nunca deve vazar para o cliente
    expect(JSON.stringify(suggestion)).not.toContain('justificativa');
  });

  it('extrai nota do tipo literatura válida', () => {
    const json = JSON.stringify({ tipo: 'literatura', titulo: 'Ref Y', corpo: 'Autor Z, 2021.' });
    const full = `${NOTE_MARK_START}${json}${NOTE_MARK_END}`;
    const { suggestion } = extractNoteSuggestion(full);
    expect(suggestion?.tipo).toBe('literatura');
  });

  it('degrada para null em JSON malformado', () => {
    const full = `Texto\n${NOTE_MARK_START}não-é-json${NOTE_MARK_END}`;
    const { narrative, suggestion } = extractNoteSuggestion(full);
    expect(narrative).toBe('Texto');
    expect(suggestion).toBeNull();
  });

  it('degrada para null quando tipo inválido', () => {
    const json = JSON.stringify({ tipo: 'invalido', titulo: 'T', corpo: 'C' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('degrada para null quando titulo vazio', () => {
    const json = JSON.stringify({ tipo: 'rapida', titulo: '', corpo: 'C' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('trata pagina_origem ausente como null', () => {
    const json = JSON.stringify({ tipo: 'rapida', titulo: 'T', corpo: 'C' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.paginaOrigem).toBeNull();
  });

  it('trata pagina_origem "null" string como null', () => {
    const json = JSON.stringify({ tipo: 'rapida', titulo: 'T', corpo: 'C', pagina_origem: 'null' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.paginaOrigem).toBeNull();
  });

  it('preserva pagina_origem quando preenchida', () => {
    const json = JSON.stringify({ tipo: 'rapida', titulo: 'T', corpo: 'C', pagina_origem: 'p3' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.paginaOrigem).toBe('p3');
  });
});
