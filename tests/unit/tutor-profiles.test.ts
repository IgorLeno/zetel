import { describe, expect, it } from 'vitest';
import {
  AXES,
  BUILTIN_PROFILES,
  applyOverrides,
  compileTutorInstructions,
  getBuiltinProfile,
  parseAxes,
  parseProfileOverrides,
  parseTone,
  TutorProfileError,
} from '@/lib/tutor-profiles';

const fullAxes = {
  proactivity: 0,
  questioning: 1,
  directiveness: 2,
  depth: 3,
  pace: 4,
  analogies: 2,
};

describe('perfis do tutor', () => {
  it('expõe seis built-ins imutáveis com escalas válidas', () => {
    expect(BUILTIN_PROFILES.map((profile) => profile.name)).toEqual([
      'Conversa Livre',
      'Professor Socrático',
      'Explicador',
      'Resolver Comigo',
      'Revisão Rápida',
      'Professor Profundo',
    ]);
    for (const profile of BUILTIN_PROFILES) {
      expect(profile.builtin).toBe(true);
      for (const axis of AXES) {
        expect(profile.axes[axis]).toBeGreaterThanOrEqual(0);
        expect(profile.axes[axis]).toBeLessThanOrEqual(4);
      }
      expect(profile.tone.informality).toBeLessThanOrEqual(2);
    }
    const copy = getBuiltinProfile('professor-socratico');
    copy!.axes.questioning = 0;
    expect(getBuiltinProfile('professor-socratico')!.axes.questioning).toBe(4);
  });

  it('rejeita eixo, tom e ajuste fora da escala', () => {
    expect(() => parseAxes({ ...fullAxes, pace: 5 })).toThrow(TutorProfileError);
    expect(() => parseAxes({ ...fullAxes, pace: 1.5 })).toThrow(TutorProfileError);
    expect(() => parseAxes({ questioning: 1 })).toThrow(TutorProfileError);
    expect(() => parseTone({ informality: 0, humor: 0, concision: 3 })).toThrow(TutorProfileError);
    expect(() => parseProfileOverrides({ ritmo: 2 })).toThrow(TutorProfileError);
    expect(parseProfileOverrides({ pace: 2 })).toEqual({ pace: 2 });
    expect(parseProfileOverrides(null)).toBeNull();
  });

  it('compila níveis distintos em instruções distintas e estáveis', () => {
    const base = getBuiltinProfile('conversa-livre')!;
    const low = applyOverrides(base, { questioning: 0, pace: 0, depth: 0 });
    const high = applyOverrides(base, { questioning: 4, pace: 4, depth: 4 });
    const lowText = compileTutorInstructions(low);
    const highText = compileTutorInstructions(high);
    expect(lowText).not.toBe(highText);
    expect(highText).toContain('Pergunte antes de explicar');
    expect(highText).toContain('Avance rápido e reduza checagens.');
    expect(highText).toContain('Investigue fundamentos, implicações e conexões.');
    expect(lowText).toContain('Não faça perguntas');
    expect(compileTutorInstructions(high)).toBe(highText);
    expect(lowText).not.toContain('Pergunte antes de explicar');
  });
});
