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

  // ── Módulo 15: tipos novos ──────────────────────────────────────────────────

  it('extrai nota do tipo elaborada com perguntas válidas', () => {
    const json = JSON.stringify({
      tipo: 'elaborada',
      titulo: 'Conceito X',
      corpo: '',
      perguntas: ['O que é X?', 'Quando se usa X?', 'Qual a limitação de X?'],
      justificativa: 'nunca deve sair',
    });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.tipo).toBe('elaborada');
    expect(suggestion!.titulo).toBe('Conceito X');
    expect(suggestion!.corpo).toBe('');
    expect(suggestion!.perguntas).toEqual(['O que é X?', 'Quando se usa X?', 'Qual a limitação de X?']);
    expect(JSON.stringify(suggestion)).not.toContain('justificativa');
  });

  it('elaborada aceita corpo vazio sem degradar', () => {
    const json = JSON.stringify({ tipo: 'elaborada', titulo: 'T', corpo: '', perguntas: ['P1?', 'P2?'] });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.tipo).toBe('elaborada');
    expect(suggestion?.corpo).toBe('');
  });

  it('elaborada degrada para null quando perguntas ausentes', () => {
    const json = JSON.stringify({ tipo: 'elaborada', titulo: 'T', corpo: '' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('elaborada degrada para null quando perguntas tem menos de 2 itens', () => {
    const json = JSON.stringify({ tipo: 'elaborada', titulo: 'T', corpo: '', perguntas: ['Só uma?'] });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('elaborada trunca perguntas para no máximo 3', () => {
    const json = JSON.stringify({ tipo: 'elaborada', titulo: 'T', corpo: '', perguntas: ['P1?', 'P2?', 'P3?', 'P4?', 'P5?'] });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.perguntas?.length).toBe(3);
    expect(suggestion?.perguntas).toEqual(['P1?', 'P2?', 'P3?']);
  });

  it('elaborada faz trim em perguntas com espaços nas bordas', () => {
    const json = JSON.stringify({
      tipo: 'elaborada',
      titulo: 'T',
      corpo: '',
      perguntas: ['  P1?  ', '  P2?  '],
    });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.perguntas).toEqual(['P1?', 'P2?']);
  });

  it('extrai nota do tipo minha-nota com dicas válidas', () => {
    const json = JSON.stringify({
      tipo: 'minha-nota',
      titulo: 'Minha visão',
      corpo: '',
      dicas: ['O que é?', 'Por que importa?', 'Como conecta com o que já sabe?'],
    });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.tipo).toBe('minha-nota');
    expect(suggestion!.titulo).toBe('Minha visão');
    expect(suggestion!.corpo).toBe('');
    expect(suggestion!.dicas).toEqual(['O que é?', 'Por que importa?', 'Como conecta com o que já sabe?']);
  });

  it('minha-nota força corpo vazio independente do que o LLM enviou', () => {
    const json = JSON.stringify({ tipo: 'minha-nota', titulo: 'T', corpo: 'texto da IA', dicas: ['D1?', 'D2?'] });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion?.corpo).toBe('');
  });

  it('minha-nota degrada para null quando dicas ausentes', () => {
    const json = JSON.stringify({ tipo: 'minha-nota', titulo: 'T', corpo: '' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('minha-nota degrada para null quando dicas tem menos de 2 itens', () => {
    const json = JSON.stringify({ tipo: 'minha-nota', titulo: 'T', corpo: '', dicas: ['Só uma'] });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('minha-nota trunca dicas para no máximo 3', () => {
    const json = JSON.stringify({
      tipo: 'minha-nota',
      titulo: 'T',
      corpo: '',
      dicas: ['D1?', 'D2?', 'D3?', 'D4?', 'D5?'],
    });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion!.dicas).toEqual(['D1?', 'D2?', 'D3?']);
  });

  it('minha-nota faz trim em dicas com espaços nas bordas', () => {
    const json = JSON.stringify({
      tipo: 'minha-nota',
      titulo: 'T',
      corpo: '',
      dicas: ['  D1?  ', '  D2?  '],
    });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion!.dicas).toEqual(['D1?', 'D2?']);
  });

  it('rapida ainda degrada para null quando corpo vazio', () => {
    const json = JSON.stringify({ tipo: 'rapida', titulo: 'T', corpo: '' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });

  it('literatura ainda degrada para null quando corpo vazio', () => {
    const json = JSON.stringify({ tipo: 'literatura', titulo: 'T', corpo: '' });
    const { suggestion } = extractNoteSuggestion(`${NOTE_MARK_START}${json}${NOTE_MARK_END}`);
    expect(suggestion).toBeNull();
  });
});
