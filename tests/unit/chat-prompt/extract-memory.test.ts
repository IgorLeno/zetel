import { describe, expect, it } from 'vitest';
import {
  extractMemorySuggestion,
  MEMORY_MARK_END,
  MEMORY_MARK_START,
} from '@/lib/chat-prompt';

describe('extractMemorySuggestion', () => {
  it('retorna null quando marcador ausente', () => {
    const { suggestion } = extractMemorySuggestion('Texto normal sem marcadores.');
    expect(suggestion).toBeNull();
  });

  it('extrai sugestão de memória válida', () => {
    const json = JSON.stringify({
      titulo: 'Preferência X',
      corpo: 'O usuário prefere exemplos concretos.',
      justificativa: 'razão interna',
    });
    const full = `Texto\n${MEMORY_MARK_START}${json}${MEMORY_MARK_END}`;
    const { suggestion } = extractMemorySuggestion(full);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.titulo).toBe('Preferência X');
    expect(suggestion!.corpo).toBe('O usuário prefere exemplos concretos.');
    // justificativa nunca vaza
    expect(JSON.stringify(suggestion)).not.toContain('justificativa');
  });

  it('degrada para null com JSON malformado', () => {
    const full = `${MEMORY_MARK_START}not-json${MEMORY_MARK_END}`;
    expect(extractMemorySuggestion(full).suggestion).toBeNull();
  });

  it('degrada para null quando titulo vazio', () => {
    const json = JSON.stringify({ titulo: '', corpo: 'C' });
    expect(extractMemorySuggestion(`${MEMORY_MARK_START}${json}${MEMORY_MARK_END}`).suggestion).toBeNull();
  });

  it('degrada para null quando corpo vazio', () => {
    const json = JSON.stringify({ titulo: 'T', corpo: '' });
    expect(extractMemorySuggestion(`${MEMORY_MARK_START}${json}${MEMORY_MARK_END}`).suggestion).toBeNull();
  });

  it('marcadores de memória são distintos dos de nota', () => {
    expect(MEMORY_MARK_START).not.toBe('<<<NOTA_SUGERIDA>>>');
    expect(MEMORY_MARK_END).not.toBe('<<<FIM_NOTA>>>');
  });
});
