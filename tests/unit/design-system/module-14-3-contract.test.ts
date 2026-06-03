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
  readingProgress: join(root, 'components/ReadingProgress.tsx'),
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

  it('Zone A — topbar: page.tsx uses crumb/doc-title classes; reading progress owns the progress badge', () => {
    const zetelDetailPage = readSource('zetelDetailPage');
    const readingProgress = readSource('readingProgress');
    expect(zetelDetailPage, 'topbar contract: missing class "crumb" in page.tsx').toContain('crumb');
    expect(zetelDetailPage, 'topbar contract: missing class "doc-title" in page.tsx').toContain('doc-title');
    expect(readingProgress, 'topbar contract: missing topbar-percent-badge in ReadingProgress').toContain('topbar-percent-badge');
    expect(readingProgress, 'topbar contract: reading progress must render current / total label').toContain('progressLabel');
  });

  it('Zone A — topbar: globals.css has .topbar / .crumb / .doc-title / .pill rules', () => {
    const css = readSource('css');
    expect(css, 'topbar contract: missing .topbar in globals.css').toContain('.topbar');
    expect(css, 'topbar contract: missing .crumb in globals.css').toContain('.crumb');
    expect(css, 'topbar contract: missing .doc-title in globals.css').toContain('.doc-title');
    expect(css, 'topbar contract: missing .pill rule in globals.css').toMatch(/\.pill\s*\{/);
  });

  it('Zone B — leitura toolbar: removes visible build/status controls; mode selection moved to sidebar URL nav', () => {
    const leituraPanel = readSource('leituraPanel');
    // segmented control removed — mode is now selected via sidebar ?view= param
    expect(leituraPanel, 'toolbar contract: segmented must be absent (mode moved to sidebar)').not.toContain('class="segmented"');
    expect(leituraPanel, 'toolbar contract: build button must not render as ghost-btn in LeituraPanel').not.toContain('ghost-btn');
    expect(leituraPanel, 'toolbar contract: statusChip must not render in LeituraPanel toolbar').not.toContain('statusChip');
    expect(leituraPanel, 'toolbar contract: buttonLabel must not render in LeituraPanel toolbar').not.toContain('buttonLabel');
    expect(leituraPanel, 'toolbar contract: guideProgress must not render in LeituraPanel toolbar').not.toContain('guideProgress');
  });

  it('Zone B — leitura FAB: partner toggle floats over iframe and is hidden while chat is open', () => {
    const leituraPanel = readSource('leituraPanel');
    const css = readSource('css');
    expect(leituraPanel, 'FAB contract: partner toggle must render only when iframe is visible and chat is closed').toContain('showIframe && !chatOpen');
    expect(leituraPanel, 'FAB contract: missing partner-toggle-btn in LeituraPanel').toContain('partner-toggle-btn');
    expect(css, 'FAB contract: .partner-toggle-btn must be positioned absolute').toMatch(/\.partner-toggle-btn\s*\{[\s\S]*position:\s*absolute/);
    expect(css, 'FAB contract: .partner-toggle-btn must sit 24px from bottom').toMatch(/\.partner-toggle-btn\s*\{[\s\S]*bottom:\s*24px/);
    expect(css, 'FAB contract: .partner-toggle-btn must sit 24px from right').toMatch(/\.partner-toggle-btn\s*\{[\s\S]*right:\s*24px/);
    expect(css, 'FAB contract: .partner-toggle-btn.on must not exist because FAB is hidden when chat is open').not.toContain('.partner-toggle-btn.on');
    expect(leituraPanel, 'close contract: chat-open state must still expose a close control').toContain('partner-close-tab');
    expect(leituraPanel, 'close contract: close control must set chatOpen=false').toContain('setChatOpen(false)');
    expect(css, 'close contract: missing .partner-close-tab style in globals.css').toContain('.partner-close-tab');
  });

  it('Zone B — chat: keeps ChatPanel mounted without display none/contents and syncs reading mode from selectedMode', () => {
    const leituraPanel = readSource('leituraPanel');
    expect(
      leituraPanel,
      'chat mount contract: wrapper must not use display:none or display:contents to hide ChatPanel',
    ).not.toContain("display: chatOpen ? 'contents' : 'none'");
    expect(
      leituraPanel,
      'chat mount contract: selected reading mode must sync immediately before iframe page-change',
    ).toContain('setCurrentReadingMode(selectedMode);');
    expect(
      leituraPanel,
      'chat mount contract: context reset effect must depend on selectedMode',
    ).toContain('}, [selectedMode]);');
    expect(
      leituraPanel,
      'chat mount contract: closed chat wrapper must clip layout without unmounting ChatPanel',
    ).toContain("overflow: chatOpen ? 'visible' : 'hidden'");
  });

  it('Zone B — chat: removes visual reading context from the header area', () => {
    const chatPanel = readSource('chatPanel');
    const css = readSource('css');
    expect(chatPanel, 'chat contract: chat-head-sub must be removed from ChatPanel').not.toContain('chat-head-sub');
    expect(chatPanel, 'chat contract: context-chip must be removed from ChatPanel').not.toContain('context-chip');
    expect(css, 'chat contract: .chat-head-sub must be removed from globals.css').not.toContain('.chat-head-sub');
    expect(css, 'chat contract: .context-chip must be removed from globals.css').not.toContain('.context-chip');
  });

  it('Zone B — reading progress: technical iframe posts pagesCount and topbar renders current / total', () => {
    const readingProgress = readSource('readingProgress');
    const renderService = readSource('renderService');
    expect(renderService, 'progress contract: technical page-change payload must include pagesCount').toContain('pagesCount: total');
    expect(readingProgress, 'progress contract: ReadingProgress must store current/total progress').toContain('setProgress');
    expect(readingProgress, 'progress contract: ReadingProgress must render current / total label').toContain('progressLabel');
  });

  it('Zone B — chat: has mic-toggle / autoplay-toggle composer bar (no mode-pop/mode-cell)', () => {
    const chatPanel = readSource('chatPanel');
    const css = readSource('css');
    expect(chatPanel, 'chat contract: missing mic-toggle in ChatPanel').toContain('mic-toggle');
    expect(chatPanel, 'chat contract: missing autoplay-toggle in ChatPanel').toContain('autoplay-toggle');
    expect(chatPanel, 'chat contract: missing composer-bar in ChatPanel').toContain('composer-bar');
    expect(css, 'chat contract: missing .composer-bar in globals.css').toContain('.composer-bar');
    expect(css, 'chat contract: missing .mic-btn.active in globals.css').toContain('.mic-btn.active');
    expect(chatPanel, 'chat contract: mode-pop must be removed from ChatPanel').not.toContain('mode-pop');
    expect(chatPanel, 'chat contract: mode-cell must be removed from ChatPanel').not.toContain('mode-cell');
    expect(css, 'chat contract: .mode-pop must be removed from globals.css').not.toContain('.mode-pop');
    expect(css, 'chat contract: .mode-cell must be removed from globals.css').not.toContain('.mode-cell');
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
