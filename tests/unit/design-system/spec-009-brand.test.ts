import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da identidade visual (SPEC-009): paleta da marca, neutros com
 * contraste WCAG AA nos dois temas, ícone do app autocontido e marca no trilho.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const css = read('app/globals.css');
const icon = read('app/icon.svg');
const logo = read('components/ZetelLogo.tsx');
const sidebar = read('components/Sidebar.tsx');
const greeting = read('components/HomeGreeting.tsx');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`CSS contract: missing block ${selector}`);
  return css.slice(start, css.indexOf('\n}', start));
}

const light = block(':root');
const dark = block("[data-theme='dark']");

/** Resolve um token para hex, seguindo `var(--x)` no tema e depois no :root. */
function token(theme: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(theme) ?? new RegExp(`${name}:\\s*([^;]+);`).exec(light);
  if (!match) throw new Error(`missing token ${name}`);
  const value = match[1].trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) return token(theme, ref[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`token ${name} is not a hex color: ${value}`);
  return value;
}

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

describe('SPEC-009 brand identity', () => {
  it('defines the brand palette once, in :root', () => {
    const palette = {
      '--brand-creme': '#faf7f2',
      '--brand-grafite': '#2e2e33',
      '--brand-pessego': '#f7c9b3',
      '--brand-lavanda': '#cec4f0',
      '--brand-cinza': '#d9d4cc',
      '--brand-berinjela': '#4e3d63',
    };
    for (const [name, hex] of Object.entries(palette)) expect(token(light, name)).toBe(hex);
    expect(token(light, '--bg')).toBe('#faf7f2');
    expect(token(light, '--text')).toBe('#2e2e33');
    // SPEC-010: o escuro voltou aos neutros quentes anteriores; a marca não define o escuro.
    expect(token(dark, '--surface')).toBe('#28221e');
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('keeps body text at WCAG AA in the %s theme', (_name, theme) => {
    for (const fg of ['--text', '--text-2']) {
      for (const bg of ['--bg', '--surface', '--reading-bg']) {
        expect(contrast(token(theme, fg), token(theme, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('does not lower --text-3 contrast below the previous palette', () => {
    // Valores anteriores à SPEC-009: 2.96 (claro, sobre --bg) e 4.15 (escuro, sobre --surface).
    expect(contrast(token(light, '--text-3'), token(light, '--bg'))).toBeGreaterThanOrEqual(2.96);
    expect(contrast(token(dark, '--text-3'), token(dark, '--surface'))).toBeGreaterThanOrEqual(4.15);
  });

  it('keeps partner color and accent driven by the active partner', () => {
    expect(light).toMatch(/--p:\s*var\(--partner-pessego\)/);
    expect(light).toMatch(/--accent:\s*var\(--p-strong\)/);
    expect(css).not.toMatch(/--(?:p|accent):\s*var\(--brand-/);
  });

  it('ships a self-contained app icon on a creme tile', () => {
    expect(icon).toContain('#faf7f2');
    for (const color of ['#f7c9b3', '#cec4f0', '#4e3d63']) expect(icon).toContain(color);
    expect(icon).not.toMatch(/href=|url\(|<image|<script|@import/);
  });

  it('draws the mark as vector with explicit fills', () => {
    for (const color of ['#f7c9b3', '#cec4f0', '#4e3d63']) expect(logo).toContain(`fill="${color}"`);
    expect(logo).not.toMatch(/<img|\.webp|\.png/);
  });

  it('uses the mark in the rail and the lockup on the home screen', () => {
    expect(sidebar).toContain('<ZetelMark');
    expect(sidebar).toContain('aria-label="Zetel — início"');
    expect(sidebar).not.toMatch(/className="rail-logo"[^>]*>z</);
    expect(greeting).toContain('<ZetelLockup');
    expect(logo).toContain('parceiro de estudos');
  });
});
