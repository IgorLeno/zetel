import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = process.cwd();

const sources = {
  css: join(root, 'app/globals.css'),
  leituraPanel: join(root, 'components/LeituraPanel.tsx'),
  chatPanel: join(root, 'components/ChatPanel.tsx'),
  noteCard: join(root, 'components/NoteCard.tsx'),
  memoryCard: join(root, 'components/MemoryCard.tsx'),
  renderService: join(root, 'lib/render-service.ts'),
  studyGuide: join(root, 'lib/study-guide-service.ts'),
  zetelDetailPage: join(root, 'app/zetel/[slug]/page.tsx'),
} as const;

type SourceKey = keyof typeof sources;

const files: Partial<Record<SourceKey, string>> = {};
const missing: SourceKey[] = [];

function readSource(key: SourceKey): string {
  const content = files[key];
  if (content === undefined) {
    throw new Error(`Missing contract source "${key}" (${sources[key]})`);
  }
  return content;
}

beforeAll(() => {
  for (const [key, path] of Object.entries(sources) as [SourceKey, string][]) {
    if (!existsSync(path)) {
      missing.push(key);
      continue;
    }
    try {
      files[key] = readFileSync(path, 'utf8');
    } catch (error) {
      missing.push(key);
      throw new Error(
        `Failed to read contract source "${key}" (${path}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
});

describe('Module 14.3 design system contract', () => {
  it('loads all contract sources', () => {
    expect(missing, `Missing contract sources: ${missing.join(', ')}`).toEqual([]);
  });

  it('Zone A — topbar: page.tsx uses crumb/doc-title/pill classes', () => {
    const zetelDetailPage = readSource('zetelDetailPage');
    expect(zetelDetailPage, 'topbar contract: missing class "crumb" in page.tsx').toContain('crumb');
    expect(zetelDetailPage, 'topbar contract: missing class "doc-title" in page.tsx').toContain('doc-title');
    expect(zetelDetailPage, 'topbar contract: missing class "pill" in page.tsx').toContain('pill');
  });

  it('Zone A — topbar: globals.css has .topbar / .crumb / .doc-title / .pill rules', () => {
    const css = readSource('css');
    expect(css, 'topbar contract: missing .topbar in globals.css').toContain('.topbar');
    expect(css, 'topbar contract: missing .crumb in globals.css').toContain('.crumb');
    expect(css, 'topbar contract: missing .doc-title in globals.css').toContain('.doc-title');
    expect(css, 'topbar contract: missing .pill rule in globals.css').toMatch(/\.pill\s*\{/);
  });

  it('Zone B — leitura toolbar: uses .segmented/.seg-opt and .ghost-btn', () => {
    const leituraPanel = readSource('leituraPanel');
    const css = readSource('css');
    expect(leituraPanel, 'toolbar contract: missing class "segmented" in LeituraPanel').toContain('segmented');
    expect(leituraPanel, 'toolbar contract: missing class "seg-opt" in LeituraPanel').toContain('seg-opt');
    expect(leituraPanel, 'toolbar contract: missing class "ghost-btn" in LeituraPanel').toContain('ghost-btn');
    expect(css, 'toolbar contract: missing .segmented in globals.css').toContain('.segmented');
    expect(css, 'toolbar contract: missing .seg-opt in globals.css').toContain('.seg-opt');
    expect(css, 'toolbar contract: missing .ghost-btn in globals.css').toContain('.ghost-btn');
  });

  it('Zone B — chat: has context-chip', () => {
    const chatPanel = readSource('chatPanel');
    const css = readSource('css');
    expect(chatPanel, 'chat contract: missing context-chip in ChatPanel').toContain('context-chip');
    expect(css, 'chat contract: missing .context-chip in globals.css').toContain('.context-chip');
  });

  it('Zone B — chat: has mode-pop / mode-cell composer bar', () => {
    const chatPanel = readSource('chatPanel');
    const css = readSource('css');
    expect(chatPanel, 'chat contract: missing mode-pop popover in ChatPanel').toContain('mode-pop');
    expect(chatPanel, 'chat contract: missing mode-cell in ChatPanel').toContain('mode-cell');
    expect(chatPanel, 'chat contract: missing composer-bar in ChatPanel').toContain('composer-bar');
    expect(css, 'chat contract: missing .mode-pop in globals.css').toContain('.mode-pop');
    expect(css, 'chat contract: missing .mode-cell in globals.css').toContain('.mode-cell');
    expect(css, 'chat contract: missing .composer-bar in globals.css').toContain('.composer-bar');
  });

  it('Zone B — chat: no raw emoji in composer logic (uses SVG icons)', () => {
    const chatPanel = readSource('chatPanel');
    expect(chatPanel, 'chat contract: emoji 🎙 must be replaced with SVG in ChatPanel').not.toContain('🎙');
    expect(chatPanel, 'chat contract: emoji ⏹ must be replaced with SVG in ChatPanel').not.toContain('⏹');
    expect(chatPanel, 'chat contract: emoji 🔊 must be replaced with SVG in ChatPanel').not.toContain('🔊');
    expect(chatPanel, 'chat contract: emoji 💬 must be replaced with SVG in ChatPanel').not.toContain('💬');
  });

  it('Zone B — suggestion cards use .sugg-card classes', () => {
    const noteCard = readSource('noteCard');
    const memoryCard = readSource('memoryCard');
    const css = readSource('css');
    expect(noteCard, 'card contract: missing sugg-card in NoteCard').toContain('sugg-card');
    expect(memoryCard, 'card contract: missing sugg-card in MemoryCard').toContain('sugg-card');
    expect(memoryCard, 'card contract: missing "sugg-card mem" in MemoryCard').toContain('sugg-card mem');
    expect(css, 'card contract: missing .sugg-card in globals.css').toContain('.sugg-card');
  });

  it('Zone C — render-service iframe template uses violet accent, not old blue', () => {
    const renderService = readSource('renderService');
    expect(renderService, 'iframe contract: old blue accent #58a6ff must not be present in render-service').not.toContain('#58a6ff');
    expect(renderService, 'iframe contract: old blue accent #0969da must not be present in render-service').not.toContain('#0969da');
    expect(renderService, 'iframe contract: violet accent #7d7bff must be present in render-service').toContain('#7d7bff');
  });

  it('Zone C — study-guide-service iframe template uses violet accent, not old blue', () => {
    const studyGuide = readSource('studyGuide');
    expect(studyGuide, 'iframe contract: old blue accent #58a6ff must not be present in study-guide-service').not.toContain('#58a6ff');
    expect(studyGuide, 'iframe contract: old blue accent #0969da must not be present in study-guide-service').not.toContain('#0969da');
    expect(studyGuide, 'iframe contract: violet accent #7d7bff must be present in study-guide-service').toContain('#7d7bff');
  });
});
