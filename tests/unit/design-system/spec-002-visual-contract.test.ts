import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTNER_COLORS } from '@/lib/tutor-profiles';

/**
 * Contrato do redesign aconchegante (SPEC-002). Substitui os contratos 14.2/14.3,
 * que descreviam o visual anterior. Foca no que não pode regredir: paleta dos
 * parceiros, isolamento do artefato, superfícies sempre montadas e ganchos de teste.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const css = read('app/globals.css');
const layout = read('app/layout.tsx');
const sidebar = read('components/Sidebar.tsx');
const chatPanel = read('components/ChatPanel.tsx');
const studyShell = read('components/StudyShell.tsx');
const leituraPanel = read('components/LeituraPanel.tsx');
const workspace = read('components/ZetelWorkspace.tsx');
const orb = read('components/PartnerOrb.tsx');
const noteCard = read('components/NoteCard.tsx');
const memoryCard = read('components/MemoryCard.tsx');
const renderService = read('lib/render-service.ts');
const studyGuide = read('lib/study-guide-service.ts');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`CSS contract: missing block ${selector}`);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('SPEC-002 visual contract', () => {
  it('defines every partner color for light and dark themes', () => {
    const light = block(':root');
    const dark = block("[data-theme='dark']");
    for (const color of PARTNER_COLORS) {
      expect(light, `light theme missing --partner-${color}`).toMatch(new RegExp(`--partner-${color}:\\s*#[0-9a-f]{6}`));
      expect(dark, `dark theme missing --partner-${color}`).toMatch(new RegExp(`--partner-${color}:\\s*#[0-9a-f]{6}`));
    }
    expect(light).toMatch(/--p:\s*var\(--partner-pessego\)/);
    expect(light).toMatch(/--accent:\s*var\(--p-strong\)/);
  });

  it('keeps compatibility aliases used by older components', () => {
    for (const alias of ['--bg-card', '--bg-hover', '--border-light', '--accent-dim', '--accent-hover', '--text-inv', '--memory-dim']) {
      expect(css, `missing alias ${alias}`).toContain(`${alias}:`);
    }
  });

  it('loads the cozy type pair and keeps reading in Literata', () => {
    expect(layout).toContain("import { Fraunces, Nunito, Literata, JetBrains_Mono } from 'next/font/google'");
    expect(css).toMatch(/--font-ui:\s*var\(--font-nunito\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-fraunces\)/);
    expect(css).toMatch(/--font-read:\s*var\(--font-literata\)/);
  });

  it('navigates through the icon rail, including partners', () => {
    expect(sidebar).toContain("href: '/parceiros'");
    expect(sidebar).toContain('aria-label={item.label}');
    expect(css).toContain('.rail-item.active');
  });

  it('keeps the reading artifact isolated (sandbox without same-origin)', () => {
    expect(leituraPanel).toContain('sandbox="allow-scripts"');
    expect(leituraPanel).not.toContain('allow-same-origin');
  });

  it('keeps chat and material mounted while the material is collapsed', () => {
    expect(studyShell).toContain('{chat}');
    expect(studyShell).toContain('{reader}');
    expect(studyShell).toContain('inert={!open}');
    expect(studyShell).not.toMatch(/open\s*&&\s*reader/);
    expect(workspace).toContain("display: view === 'pdf' ? 'none' : 'contents'");
  });

  it('keeps chat test hooks and SVG icons', () => {
    for (const hook of ['mic-toggle', 'autoplay-toggle', 'voice-status', 'stop-turn', 'chat-messages', 'msg-bubble']) {
      expect(chatPanel, `ChatPanel missing data-testid ${hook}`).toContain(hook);
    }
    expect(chatPanel).toContain('className="chat-input composer-input"');
    expect(chatPanel).toContain('aria-label="Enviar"');
    for (const emoji of ['🎙', '⏹', '🔊', '💬']) expect(chatPanel).not.toContain(emoji);
  });

  it('renders the partner orb as decoration only', () => {
    expect(orb).toContain('aria-hidden');
    expect(css).toContain('.partner-orb--thinking');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('keeps suggestion cards on .sugg-card', () => {
    expect(noteCard).toContain('sugg-card');
    expect(memoryCard).toContain('sugg-card mem');
    expect(css).toContain('.sugg-card');
  });

  it('uses the warm palette in reading artifacts', () => {
    for (const source of [renderService, studyGuide]) {
      expect(source).not.toContain('#7d7bff');
      expect(source).not.toContain('#58a6ff');
      expect(source).toContain('--accent:#b8603f');
    }
  });
});
