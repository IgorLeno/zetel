import { describe, expect, it } from 'vitest';
import { suggestSessionTitle } from '@/lib/study-session-service';

describe('suggestSessionTitle', () => {
  const date = new Date('2026-09-27T15:00:00.000Z');

  it('usa documento, página e data local sem LLM', () => {
    expect(suggestSessionTitle('Termodinâmica.pdf', 12, date))
      .toBe('Termodinâmica · p. 12 · 27/09/2026');
  });

  it('usa título genérico sem foco', () => {
    expect(suggestSessionTitle(null, null, date)).toBe('Sessão · 27/09/2026');
  });
});
