import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';

const root = process.cwd();
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
const leituraPanel = readFileSync(join(root, 'components/LeituraPanel.tsx'), 'utf8');
const chatPanel = readFileSync(join(root, 'components/ChatPanel.tsx'), 'utf8');
const noteCard = readFileSync(join(root, 'components/NoteCard.tsx'), 'utf8');
const memoryCard = readFileSync(join(root, 'components/MemoryCard.tsx'), 'utf8');
const renderService = readFileSync(join(root, 'lib/render-service.ts'), 'utf8');
const studyGuide = readFileSync(join(root, 'lib/study-guide-service.ts'), 'utf8');
const zetelDetailPage = readFileSync(join(root, 'app/zetel/[slug]/page.tsx'), 'utf8');

function assertIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) throw new Error(message);
}
function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) throw new Error(message);
}
function assertMatch(haystack: string, pattern: RegExp, message: string) {
  if (!pattern.test(haystack)) throw new Error(message);
}

describe('Module 14.3 design system contract', () => {
  it('Zone A — topbar: page.tsx uses crumb/doc-title/pill classes', () => {
    assertIncludes(zetelDetailPage, 'crumb', 'topbar contract: missing class "crumb" in page.tsx');
    assertIncludes(zetelDetailPage, 'doc-title', 'topbar contract: missing class "doc-title" in page.tsx');
    assertIncludes(zetelDetailPage, 'pill', 'topbar contract: missing class "pill" in page.tsx');
  });

  it('Zone A — topbar: globals.css has .topbar / .crumb / .doc-title / .pill rules', () => {
    assertIncludes(css, '.topbar', 'topbar contract: missing .topbar in globals.css');
    assertIncludes(css, '.crumb', 'topbar contract: missing .crumb in globals.css');
    assertIncludes(css, '.doc-title', 'topbar contract: missing .doc-title in globals.css');
    assertMatch(css, /\.pill\s*\{/, 'topbar contract: missing .pill rule in globals.css');
  });

  it('Zone B — leitura toolbar: uses .segmented/.seg-opt and .ghost-btn', () => {
    assertIncludes(
      leituraPanel,
      'segmented',
      'toolbar contract: missing class "segmented" in LeituraPanel',
    );
    assertIncludes(
      leituraPanel,
      'seg-opt',
      'toolbar contract: missing class "seg-opt" in LeituraPanel',
    );
    assertIncludes(
      leituraPanel,
      'ghost-btn',
      'toolbar contract: missing class "ghost-btn" in LeituraPanel',
    );
    assertIncludes(css, '.segmented', 'toolbar contract: missing .segmented in globals.css');
    assertIncludes(css, '.seg-opt', 'toolbar contract: missing .seg-opt in globals.css');
    assertIncludes(css, '.ghost-btn', 'toolbar contract: missing .ghost-btn in globals.css');
  });

  it('Zone B — chat: has context-chip', () => {
    assertIncludes(
      chatPanel,
      'context-chip',
      'chat contract: missing context-chip in ChatPanel',
    );
    assertIncludes(css, '.context-chip', 'chat contract: missing .context-chip in globals.css');
  });

  it('Zone B — chat: has mode-pop / mode-cell composer bar', () => {
    assertIncludes(chatPanel, 'mode-pop', 'chat contract: missing mode-pop popover in ChatPanel');
    assertIncludes(chatPanel, 'mode-cell', 'chat contract: missing mode-cell in ChatPanel');
    assertIncludes(chatPanel, 'composer-bar', 'chat contract: missing composer-bar in ChatPanel');
    assertIncludes(css, '.mode-pop', 'chat contract: missing .mode-pop in globals.css');
    assertIncludes(css, '.mode-cell', 'chat contract: missing .mode-cell in globals.css');
    assertIncludes(css, '.composer-bar', 'chat contract: missing .composer-bar in globals.css');
  });

  it('Zone B — chat: no raw emoji in composer logic (uses SVG icons)', () => {
    // The mic/send/stop buttons must use SVG, not emoji glyphs
    assertNotIncludes(
      chatPanel,
      '🎙',
      'chat contract: emoji 🎙 must be replaced with SVG in ChatPanel',
    );
    assertNotIncludes(
      chatPanel,
      '⏹',
      'chat contract: emoji ⏹ must be replaced with SVG in ChatPanel',
    );
    assertNotIncludes(
      chatPanel,
      '🔊',
      'chat contract: emoji 🔊 must be replaced with SVG in ChatPanel',
    );
    assertNotIncludes(
      chatPanel,
      '💬',
      'chat contract: emoji 💬 must be replaced with SVG in ChatPanel',
    );
  });

  it('Zone B — suggestion cards use .sugg-card classes', () => {
    assertIncludes(noteCard, 'sugg-card', 'card contract: missing sugg-card in NoteCard');
    assertIncludes(memoryCard, 'sugg-card', 'card contract: missing sugg-card in MemoryCard');
    assertIncludes(memoryCard, 'sugg-card mem', 'card contract: missing "sugg-card mem" in MemoryCard');
    assertIncludes(css, '.sugg-card', 'card contract: missing .sugg-card in globals.css');
  });

  it('Zone C — render-service iframe template uses violet accent, not old blue', () => {
    assertNotIncludes(
      renderService,
      '#58a6ff',
      'iframe contract: old blue accent #58a6ff must not be present in render-service',
    );
    assertNotIncludes(
      renderService,
      '#0969da',
      'iframe contract: old blue accent #0969da must not be present in render-service',
    );
    assertIncludes(
      renderService,
      '#7d7bff',
      'iframe contract: violet accent #7d7bff must be present in render-service',
    );
  });

  it('Zone C — study-guide-service iframe template uses violet accent, not old blue', () => {
    assertNotIncludes(
      studyGuide,
      '#58a6ff',
      'iframe contract: old blue accent #58a6ff must not be present in study-guide-service',
    );
    assertNotIncludes(
      studyGuide,
      '#0969da',
      'iframe contract: old blue accent #0969da must not be present in study-guide-service',
    );
    assertIncludes(
      studyGuide,
      '#7d7bff',
      'iframe contract: violet accent #7d7bff must be present in study-guide-service',
    );
  });
});
