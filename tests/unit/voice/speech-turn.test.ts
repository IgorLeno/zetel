import { describe, expect, it } from 'vitest';
import { createSpeechTurn } from '@/hooks/useTtsQueue';

describe('createSpeechTurn', () => {
  it('descarta frases em voo e não aceita frases depois de cancelar', () => {
    const turn = createSpeechTurn();
    turn.beginTurn();
    const spoken: string[] = [];
    const pending: Array<() => void> = [];

    const enqueue = (text: string) => {
      if (turn.cancelled) return;
      const token = turn.generation;
      pending.push(() => {
        if (turn.holds(token)) spoken.push(text);
      });
    };

    enqueue('durante o stream');
    turn.cancel();
    enqueue('chegou depois de parar');
    pending.forEach((finish) => finish());

    expect(spoken).toEqual([]);
    expect(turn.cancelled).toBe(true);
  });

  it('um turno novo volta a aceitar frases', () => {
    const turn = createSpeechTurn();
    turn.beginTurn();
    turn.cancel();
    turn.cancel();
    turn.beginTurn();
    expect(turn.cancelled).toBe(false);
    const token = turn.generation;
    expect(turn.holds(token)).toBe(true);
  });
});
