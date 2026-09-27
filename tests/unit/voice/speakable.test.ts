import { describe, expect, it } from 'vitest';
import { toSpeakable } from '@/lib/speech-text';

describe('toSpeakable', () => {
  it('não fala marcador de fonte nem sintaxe Markdown', () => {
    const spoken = toSpeakable(
      '# Título\n\nA **entalpia** [fonte:S2] é `H`. Veja [a página](https://exemplo.test).',
    );
    expect(spoken).not.toContain('[fonte:');
    expect(spoken).not.toContain('**');
    expect(spoken).not.toContain('`');
    expect(spoken).not.toContain('#');
    expect(spoken).not.toContain('https://');
    expect(spoken).toContain('entalpia');
    expect(spoken).toContain('H');
    expect(spoken).toContain('a página');
  });
});
