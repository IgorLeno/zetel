import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da SPEC-011: no tema escuro a marca fica direto sobre o fundo, sem
 * tile creme, usando uma variante suavizada com contraste de objeto gráfico
 * (WCAG 1.4.11, ≥ 3:1). O claro mantém as cores da SPEC-009.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const css = read('app/globals.css');
const icon = read('app/icon.svg');
const logo = read('components/ZetelLogo.tsx');

const darkMark = { top: '#e3b39c', bottom: '#b6aadb', diag: '#8c79ab', lines: '#4e3d63' };
const darkBg = '#1c1815';
const darkSurface = '#28221e';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('SPEC-011 dark logo colors', () => {
  it('drops the creme tile behind the mark', () => {
    expect(css).not.toMatch(/\[data-theme='dark'\] \.rail-logo/);
    expect(css).not.toContain('zetel-lockup-mark');
    expect(logo).not.toContain('zetel-lockup-mark');
    expect(css).toMatch(/\.rail-logo \{[^}]*background: var\(--surface\)/);
  });

  it('recolors the mark through zm-* classes only in the dark theme', () => {
    for (const part of ['zm-top', 'zm-bottom', 'zm-diag', 'zm-lines']) expect(logo).toContain(`className="${part}"`);
    const rule = (part: string) => new RegExp(`\\[data-theme='dark'\\] \\.zetel-mark \\.zm-${part}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('top')).toContain(darkMark.top);
    expect(rule('bottom')).toContain(darkMark.bottom);
    expect(rule('diag')).toContain(darkMark.diag);
    expect(rule('lines')).toContain(darkMark.lines);
    expect(css).not.toMatch(/^\.zetel-mark \.zm-/m);
  });

  it('keeps the dark variant legible as a graphic object', () => {
    expect(contrast(darkMark.diag, darkBg)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkMark.diag, darkSurface)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkMark.lines, darkMark.top)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkMark.lines, darkMark.bottom)).toBeGreaterThanOrEqual(3);
  });

  it('ships the same variant in the favicon for dark system schemes', () => {
    const dark = /prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n {4}\}/.exec(icon)?.[1] ?? '';
    for (const hex of [darkSurface, ...Object.values(darkMark)]) expect(dark).toContain(hex);
    expect(icon).not.toMatch(/href=|url\(|<image|<script|@import/);
  });
});
