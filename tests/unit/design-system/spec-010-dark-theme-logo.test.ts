import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da SPEC-010: tema escuro volta aos neutros quentes de antes da
 * SPEC-009 e o indicador de dev do Next não cobre o toggle de tema. O tile
 * creme da marca foi substituído pela variante escura (SPEC-011).
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const css = read('app/globals.css');
const nextConfig = read('next.config.ts');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`CSS contract: missing block ${selector}`);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('SPEC-010 dark theme and logo', () => {
  it('restores the warm dark neutrals from before SPEC-009', () => {
    const dark = block("[data-theme='dark']");
    const neutrals = {
      '--bg': '#1c1815',
      '--bg-2': '#231e1a',
      '--surface': '#28221e',
      '--surface-2': '#2f2824',
      '--surface-3': '#372f2a',
      '--hover': '#342c27',
      '--reading-bg': '#24201c',
      '--border': '#3d342e',
      '--border-soft': '#332b26',
      '--text': '#f3ebe2',
      '--text-2': '#c3b4a6',
      '--text-3': '#8f8173',
      '--text-4': '#62564c',
    };
    for (const [name, hex] of Object.entries(neutrals)) {
      expect(dark, name).toMatch(new RegExp(`\\n  ${name}:\\s*${hex};`));
    }
  });

  it('disables the Next dev indicator that covered the theme toggle', () => {
    expect(nextConfig).toMatch(/devIndicators:\s*false/);
  });
});
