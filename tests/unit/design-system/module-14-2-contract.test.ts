import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';

const root = process.cwd();
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
const sidebar = readFileSync(join(root, 'components/Sidebar.tsx'), 'utf8');
const chatPanel = readFileSync(join(root, 'components/ChatPanel.tsx'), 'utf8');

function assertIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(message);
  }
}

function assertMatch(haystack: string, pattern: RegExp, message: string) {
  if (!pattern.test(haystack)) {
    throw new Error(message);
  }
}

describe('Module 14.2 design system contract', () => {
  it('uses the violet-indigo token system with compatibility aliases', () => {
    assertMatch(css, /--accent:\s*#7d7bff/, 'Design contract: missing token --accent: #7d7bff');
    assertMatch(css, /--accent-strong:\s*#6a67f5/, 'Design contract: missing token --accent-strong: #6a67f5');
    assertMatch(css, /--accent-ink:\s*#ffffff/, 'Design contract: missing token --accent-ink: #ffffff');
    assertMatch(
      css,
      /--font-ui:\s*var\(--font-hanken\),\s*-apple-system/,
      'Design contract: missing token --font-ui with Hanken Grotesk stack',
    );
    assertMatch(
      css,
      /--font-read:\s*var\(--font-literata\),\s*Georgia,\s*'Times New Roman',\s*serif/,
      'Design contract: missing token --font-read with Literata stack',
    );
    assertMatch(
      css,
      /--font-mono:\s*var\(--font-jetbrains-mono\),\s*ui-monospace/,
      'Design contract: missing token --font-mono with JetBrains Mono stack',
    );
    assertMatch(css, /--bg-side:\s*var\(--bg-rail\)/, 'Design contract: missing compatibility alias --bg-side');
    assertMatch(css, /--bg-card:\s*var\(--surface\)/, 'Design contract: missing compatibility alias --bg-card');
    assertMatch(css, /--bg-hover:\s*var\(--hover\)/, 'Design contract: missing compatibility alias --bg-hover');
    assertMatch(
      css,
      /--border-light:\s*var\(--border-soft\)/,
      'Design contract: missing compatibility alias --border-light',
    );
    assertMatch(css, /--accent-dim:\s*var\(--accent-tint\)/, 'Design contract: missing compatibility alias --accent-dim');
    assertNotIncludes(css, '--accent:       #3b7bdb', 'Design contract: legacy blue accent #3b7bdb must not be present');
    assertNotIncludes(css, '--accent:       #5a9cf2', 'Design contract: legacy blue accent #5a9cf2 must not be present');
  });

  it('defines the new app atmosphere and rail selector', () => {
    assertIncludes(css, '.app::before', 'Design contract: missing .app::before atmosphere rule');
    assertIncludes(css, 'radial-gradient(', 'Design contract: atmosphere gradient is missing');
    assertIncludes(css, '.app[data-rail="true"] .sidebar', 'Design contract: missing app rail selector');
    assertIncludes(
      css,
      'html[data-sidebar-collapsed="true"] .app .sidebar',
      'Design contract: missing anti-flash bridge selector for collapsed sidebar',
    );
    assertIncludes(css, '.nav-item.active::before', 'Design contract: missing active nav marker selector');
    assertMatch(
      css,
      /\.nav-item\.active::before[\s\S]*?left:\s*[^;]+;/,
      'Design contract: active nav marker must declare a left offset',
    );
  });

  it('loads the 14.2 fonts and keeps the sidebar anti-flash script', () => {
    assertIncludes(
      layout,
      "import { Hanken_Grotesk, Literata, JetBrains_Mono } from 'next/font/google'",
      'Design contract: missing Hanken/Literata/JetBrains imports in layout',
    );
    assertIncludes(layout, "variable: '--font-hanken'", 'Design contract: missing --font-hanken variable binding');
    assertIncludes(layout, "variable: '--font-literata'", 'Design contract: missing --font-literata variable binding');
    assertIncludes(layout, "variable: '--font-jetbrains-mono'", 'Design contract: missing --font-jetbrains-mono variable binding');
    assertIncludes(layout, 'SIDEBAR_ANTI_FLASH', 'Design contract: missing SIDEBAR_ANTI_FLASH script');
    assertIncludes(
      layout,
      "document.documentElement.dataset.sidebarCollapsed='true'",
      'Design contract: anti-flash script must set html[data-sidebar-collapsed]',
    );
    assertIncludes(layout, 'className="app"', 'Design contract: layout must include .app wrapper');
  });

  it('synchronizes sidebar collapse to the app rail attribute', () => {
    assertIncludes(
      sidebar,
      "document.querySelector<HTMLElement>('.app')?.setAttribute('data-rail', 'true')",
      "Design contract: syncRailAttribute must set data-rail via optional chaining",
    );
    assertIncludes(
      sidebar,
      "document.querySelector<HTMLElement>('.app')?.removeAttribute('data-rail')",
      "Design contract: syncRailAttribute must remove data-rail via optional chaining",
    );
    assertIncludes(
      sidebar,
      "localStorage.setItem('zetel_sidebar_collapsed'",
      'Design contract: sidebar collapse persistence key is missing',
    );
  });

  it('uses pill tabs and the updated chat shell contract', () => {
    assertIncludes(css, '.tabs {', 'Design contract: missing .tabs pill container rule');
    assertIncludes(css, 'border-radius: var(--r-md)', 'Design contract: tabs must use rounded pill radius');
    assertIncludes(css, '.tab.active', 'Design contract: missing .tab.active rule');
    assertIncludes(css, 'background: var(--surface-3)', 'Design contract: active tab must use --surface-3');
    assertMatch(css, /width:\s*\d+px/, 'Design contract: chat panel must define a pixel width');
    assertMatch(css, /min-width:\s*\d+px/, 'Design contract: chat panel must define a pixel min-width');
    assertIncludes(css, '.composer-box', 'Design contract: missing composer box style rule');
    assertIncludes(css, '.composer-input', 'Design contract: missing composer input style rule');
    assertIncludes(chatPanel, 'className="chat-avatar"', 'Design contract: ChatPanel header avatar is missing');
    assertIncludes(chatPanel, '<svg viewBox="0 0 16 16"', 'Design contract: ChatPanel avatar icon SVG is missing');
    assertIncludes(chatPanel, 'className="composer-box"', 'Design contract: ChatPanel composer wrapper is missing');
    assertIncludes(
      chatPanel,
      'className="chat-input composer-input"',
      'Design contract: ChatPanel textarea must keep chat-input composer-input classes',
    );
  });
});
