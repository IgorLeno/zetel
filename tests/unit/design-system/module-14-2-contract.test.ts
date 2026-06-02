import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'components/Sidebar.tsx'), 'utf8');
const chatPanel = readFileSync(join(root, 'components/ChatPanel.tsx'), 'utf8');

describe('Module 14.2 design system contract', () => {
  it('uses the violet-indigo token system with compatibility aliases', () => {
    expect(css).toContain('--accent:        #7d7bff');
    expect(css).toContain('--accent-strong: #6a67f5');
    expect(css).toContain('--accent-ink:    #ffffff');
    expect(css).toContain("--font-ui:    var(--font-hanken), -apple-system");
    expect(css).toContain("--font-read:  var(--font-literata), Georgia, 'Times New Roman', serif");
    expect(css).toContain("--font-mono:  var(--font-jetbrains-mono), ui-monospace");
    expect(css).toContain('--bg-side:      var(--bg-rail)');
    expect(css).toContain('--bg-card:      var(--surface)');
    expect(css).toContain('--bg-hover:     var(--hover)');
    expect(css).toContain('--border-light: var(--border-soft)');
    expect(css).toContain('--accent-dim:   var(--accent-tint)');
    expect(css).not.toContain('--accent:       #3b7bdb');
    expect(css).not.toContain('--accent:       #5a9cf2');
  });

  it('defines the new app atmosphere and rail selector', () => {
    expect(css).toContain('.app::before');
    expect(css).toContain('radial-gradient(');
    expect(css).toContain('.app[data-rail="true"] .sidebar');
    expect(css).toContain('html[data-sidebar-collapsed="true"] .app .sidebar');
    expect(css).toContain('.nav-item.active::before');
    expect(css).toContain('left: -12px');
  });

  it('loads the 14.2 fonts and keeps the sidebar anti-flash script', () => {
    expect(layout).toContain(
      "import { Hanken_Grotesk, Literata, JetBrains_Mono } from 'next/font/google'",
    );
    expect(layout).toContain("variable: '--font-hanken'");
    expect(layout).toContain("variable: '--font-literata'");
    expect(layout).toContain("variable: '--font-jetbrains-mono'");
    expect(layout).toContain('SIDEBAR_ANTI_FLASH');
    expect(layout).toContain("document.documentElement.dataset.sidebarCollapsed='true'");
    expect(layout).toContain('className="app"');
  });

  it('synchronizes sidebar collapse to the app rail attribute', () => {
    expect(sidebar).toContain("document.querySelector<HTMLElement>('.app')");
    expect(sidebar).toContain("app.dataset.rail = 'true'");
    expect(sidebar).toContain('delete app.dataset.rail');
    expect(sidebar).toContain("localStorage.setItem('zetel_sidebar_collapsed'");
  });

  it('uses pill tabs and the updated chat shell contract', () => {
    expect(css).toContain('.tabs {');
    expect(css).toContain('border-radius: var(--r-md)');
    expect(css).toContain('.tab.active');
    expect(css).toContain('background: var(--surface-3)');
    expect(css).toContain('width: 408px');
    expect(css).toContain('min-width: 408px');
    expect(css).toContain('.composer-box');
    expect(css).toContain('.composer-input');
    expect(chatPanel).toContain('className="chat-avatar"');
    expect(chatPanel).toContain('<svg viewBox="0 0 16 16"');
    expect(chatPanel).toContain('className="composer-box"');
    expect(chatPanel).toContain('className="chat-input composer-input"');
  });
});
