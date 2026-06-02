# Modulo 14.2 Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Zetel Redesign design system into the existing app shell while preserving all Module 13.4 voice/chat behavior.

**Architecture:** Keep this as a focused app-shell styling migration: replace global design tokens, switch fonts through `next/font/google`, add a real `.app` wrapper, bridge the existing pre-hydration sidebar attribute to `.app[data-rail="true"]`, and make only the necessary JSX changes for the chat avatar/composer wrapper. Do not touch LLM, voice API, render-service, ingestion, database, or vault logic.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS custom properties in `app/globals.css`, `next/font/google`, Vitest static contract tests, native gates `pnpm build`, `pnpm test:ci`, `pnpm test:coverage`, `pnpm typecheck`.

---

### File Map

- Modify: `app/globals.css` - design tokens, app atmosphere, rail selectors, sidebar/nav/tabs/chat/composer styles, compatibility aliases.
- Modify: `app/layout.tsx` - Google font imports, class variables, `.app` root wrapper, anti-flash bridge preserved on `<html>`.
- Modify: `components/Sidebar.tsx` - synchronize collapsed state to `.app[data-rail="true"]` while preserving `localStorage` key `zetel_sidebar_collapsed`.
- Modify: `components/ChatPanel.tsx` - add header avatar markup and wrap the existing textarea in `.composer-box`; keep voice state handlers unchanged.
- Create: `tests/unit/design-system/module-14-2-contract.test.ts` - static regression tests for tokens, fonts, rail bridge, chat composer/avatar, and no old blue accent.
- Modify: this plan file - mark checklist progress and add outcome note.

### Task 1: Static Contract Tests

**Files:**
- Create: `tests/unit/design-system/module-14-2-contract.test.ts`

- [x] **Step 1: Write failing tests for the 14.2 design contract**

Full contract source of truth:
- `tests/unit/design-system/module-14-2-contract.test.ts`

Tiny illustrative excerpt (not exhaustive):

```ts
if (!/--accent:\s*#7d7bff/.test(css)) {
  throw new Error('Design contract: violet-indigo accent token missing');
}
if (!layout.includes('className="app"')) {
  throw new Error('Design contract: app shell wrapper missing in layout');
}
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test:unit tests/unit/design-system/module-14-2-contract.test.ts`

Expected: FAIL because the current code still uses Inter/Newsreader, blue accent tokens, `html[data-sidebar-collapsed]` selectors, no `.app` wrapper, no `.chat-avatar`, and no `.composer-box`.

### Task 2: Fonts, App Wrapper, and Rail Bridge

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/Sidebar.tsx`

- [x] **Step 1: Update `app/layout.tsx`**

Use `Hanken_Grotesk`, `Literata`, and `JetBrains_Mono` from `next/font/google`, expose variables `--font-hanken`, `--font-literata`, and `--font-jetbrains-mono`, keep `SIDEBAR_ANTI_FLASH`, and wrap the shell:

```tsx
<body>
  <div className="app">
    <Sidebar theme={theme} />
    <main className="main">{children}</main>
  </div>
</body>
```

- [x] **Step 2: Update `components/Sidebar.tsx` rail synchronization**

Add a small helper inside the component or module:

```ts
function syncRailAttribute(collapsed: boolean) {
  if (collapsed) {
    document.querySelector<HTMLElement>('.app')?.setAttribute('data-rail', 'true');
  } else {
    document.querySelector<HTMLElement>('.app')?.removeAttribute('data-rail');
  }
}
```

On mount, read `document.documentElement.dataset.sidebarCollapsed === 'true'`, set state, and call `syncRailAttribute(initialCollapsed)`. On toggle, preserve `localStorage.setItem('zetel_sidebar_collapsed', ...)`, preserve the `<html>` dataset bridge for anti-flash compatibility, and call `syncRailAttribute(next)`.

- [x] **Step 3: Run focused test and confirm partial GREEN**

Run: `pnpm test:unit tests/unit/design-system/module-14-2-contract.test.ts`

Expected: remaining failures are CSS/chat contract only.

### Task 3: Global Design Tokens, Atmosphere, Sidebar, and Tabs

**Files:**
- Modify: `app/globals.css`

- [x] **Step 1: Replace root and dark token blocks**

Set the new accent, typography, radius, transition, surface, text, tint, shadow, chat bubble, and compatibility alias tokens exactly as specified. Keep semantic tokens `--ok`, `--warn`, `--danger`, `--danger-alpha`, `--memory`, `--memory-dim`, `--text-inv`, `--accent-hover`, and `--bg-tabs` as compatibility tokens where still referenced.

- [x] **Step 2: Add `.app` root layout and atmosphere**

Move flex shell behavior from `body` to `.app`, keep `body` as the viewport background, and add `.app::before` with the specified fixed radial gradient. Give `.sidebar` and `.main` positioning above the atmosphere with `position: relative; z-index: 1`.

- [x] **Step 3: Migrate collapsed selectors**

Replace operational collapsed rules with `.app[data-rail="true"] ...`. Keep bridge selectors prefixed by `html[data-sidebar-collapsed="true"] .app ...` for first paint only.

- [x] **Step 4: Update sidebar and nav visuals**

Apply `--bg-rail`, new logo gradient/glow, active nav indicator, rail toggle position/sizing, and transition tokens without changing sidebar markup beyond the existing component state.

- [x] **Step 5: Replace underline tabs with pill tabs**

Implement `.tabs`, `.tab`, `.tab:hover`, and `.tab.active` as the pill contract with no underline. Remove or override any existing underline behavior.

- [x] **Step 6: Run focused test**

Run: `pnpm test:unit tests/unit/design-system/module-14-2-contract.test.ts`

Expected: remaining failures are chat avatar/composer only.

### Task 4: Chat Avatar and Composer Box

**Files:**
- Modify: `components/ChatPanel.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: Add avatar markup without touching voice logic**

Change only the chat header structure around the existing title:

```tsx
<div className="chat-panel-title-group">
  <span className="chat-avatar" aria-hidden>
    <svg viewBox="0 0 16 16" focusable="false">
      <path
        d="M4 3.5h7.5A1.5 1.5 0 0 1 13 5v8.5H5.5A2.5 2.5 0 0 1 3 11V5.5A2 2 0 0 1 5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6.5h5M5.5 9h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  </span>
  <span className="chat-panel-title">Parceiro de estudos</span>
</div>
```

- [x] **Step 2: Wrap the existing textarea**

Inside `.chat-input-area`, wrap the existing textarea in:

```tsx
<div className="composer-box">
  <textarea className="chat-input composer-input" ... />
</div>
```

Do not change refs, event handlers, `disabled`, voice countdown, mic button, stop button, or send button logic.

- [x] **Step 3: Add chat/composer CSS**

Set `.chat-panel` to `width`/`min-width: 408px`, `background: var(--surface)`, `border: 1px solid var(--border-soft)`, `border-radius: var(--r-lg)`, and `box-shadow: var(--shadow-sm)`. Add `.chat-panel-title-group`, `.chat-avatar`, bubble token styles, `.composer-box:focus-within`, and `.composer-input` rules.

- [x] **Step 4: Run focused test and confirm GREEN**

Run: `pnpm test:unit tests/unit/design-system/module-14-2-contract.test.ts`

Expected: PASS.

### Task 5: Native Gates and Outcome

**Files:**
- Modify: this plan file

- [x] **Step 1: Run the required automatic verification**

Run: `pnpm build`

Expected: successful Next.js production build.

Run: `pnpm test:ci`

Expected: unit and integration tests pass.

Run: `pnpm test:coverage`

Expected: coverage thresholds pass.

Run: `pnpm typecheck`

Expected: TypeScript passes with no emit.

- [x] **Step 2: Inspect final diff scope**

Run: `git diff -- app/globals.css app/layout.tsx components/Sidebar.tsx components/ChatPanel.tsx tests/unit/design-system/module-14-2-contract.test.ts docs/superpowers/plans/2026-06-02-modulo-14-2-design-system.md`

Expected: no changes outside the 14.2 design-system scope; no LLM, voice API, render-service, database, migration, or vault logic changes.

- [x] **Step 3: Record outcome**

Append a short outcome note with verification results and any manual checks not run.

### Outcome

Implemented on 2026-06-02. Focused RED failed on the missing 14.2 contract, then GREEN passed with `tests/unit/design-system/module-14-2-contract.test.ts` included in `pnpm test:unit`. Required automatic gates passed: `pnpm build` exited 0 after compiling and generating 20 routes; `pnpm test:ci` exited 0 with 15 unit files / 135 unit tests and 4 integration files / 17 integration tests; `pnpm test:coverage` exited 0 with 19 files / 152 tests and accepted thresholds; `pnpm typecheck` exited 0. `git diff --check` exited 0. Integration and coverage runs still emitted logger EROFS warnings for `~/.zetel/logs/zetel.log`, but the test processes exited successfully. Local dev server attempt: sandboxed `pnpm dev` failed with `listen EPERM`; escalated `pnpm dev` selected `http://localhost:3001`, but Watchpack emitted repeated `EMFILE` watcher errors and `curl -I http://localhost:3001` could not connect, so no usable dev server remained active for manual browser inspection.
