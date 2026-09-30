import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AXES, type TutorProfile } from '@/lib/tutor-profiles';
import { radarPoints } from '@/lib/partner-identity';

const level = (value: number) =>
  Object.fromEntries(AXES.map((axis) => [axis, value])) as TutorProfile['axes'];

describe('radarPoints', () => {
  it('tem um vértice por eixo pedagógico', () => {
    expect(radarPoints(level(2)).split(' ')).toHaveLength(AXES.length);
  });

  it('nível máximo coincide com o anel externo e nível zero colapsa no centro', () => {
    expect(radarPoints(level(4))).toBe(radarPoints(level(0), 1));
    expect(new Set(radarPoints(level(0)).split(' '))).toEqual(new Set(['80.0,80.0']));
  });

  it('primeiro eixo aponta para o topo', () => {
    expect(radarPoints(level(4)).split(' ')[0]).toBe('80.0,22.0');
  });

  it('níveis diferentes em um eixo mudam só o vértice desse eixo', () => {
    const base = level(2);
    const changed = { ...base, [AXES[1]]: 4 };
    const a = radarPoints(base).split(' ');
    const b = radarPoints(changed).split(' ');
    expect(b.filter((point, index) => point !== a[index])).toHaveLength(1);
    expect(b[1]).not.toBe(a[1]);
  });
});

describe('PartnerStudio', () => {
  it('mostra o radar SVG junto das escalas editáveis', () => {
    const studio = readFileSync('components/PartnerStudio.tsx', 'utf8');
    expect(studio).toContain('<PartnerRadar axes={draft.axes} />');
    expect(studio).toContain('role="img"');
    expect(studio).toContain('<Scale');
  });
});
