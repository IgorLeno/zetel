# Modulo 11.2 Schema Editorial v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional StudyGuide v2 editorial blocks without changing LLM prompts or breaking v1 guides.

**Architecture:** Keep the schema v1 fields mandatory and add v2 collections as optional arrays normalized only when present. Render each v2 block through the existing deterministic HTML template, using the existing sidebar links and single `IntersectionObserver` path via `data-nav-section`.

**Tech Stack:** Next.js, TypeScript, inline HTML/CSS/JS in `lib/study-guide-service.ts`, local Node smoke script.

---

### Task 1: RED Smoke Coverage

**Files:**
- Modify: `scripts/verify-study-guide-template.mjs`

- [ ] Add static assertions for `comparison_tabs`, `accordions`, `timelines`, `tables`, `renderV2Blocks`, v2 CSS classes, and the absence of changes to `buildSystemPrompt`/`buildUserPrompt`.
- [ ] Run `node scripts/verify-study-guide-template.mjs`.
- [ ] Expected: FAIL before implementation because v2 symbols/classes do not exist yet.

### Task 2: Schema and Traceability

**Files:**
- Modify: `lib/study-guide-service.ts`

- [ ] Add optional v2 item interfaces with `guide_block_id` and trace fields.
- [ ] Add normalization helpers that accept missing v2 fields as empty arrays.
- [ ] Include present v2 collections in `ITEM_COLLECTIONS`/trace target traversal so `computeTraceability` validates their hashes server-side.
- [ ] Preserve existing required validation for v1 collections only.

### Task 3: Deterministic Rendering

**Files:**
- Modify: `lib/study-guide-service.ts`

- [ ] Add renderers for comparison tabs, accordions, timelines, and tables.
- [ ] Add v2 block links to the existing sidebar after `Seções` and before `Glossário`.
- [ ] Ensure each v2 article has an anchor id, `data-nav-section`, `traceBadge`, and `data-page` when source map has page indices.
- [ ] Do not alter `buildSystemPrompt` or `buildUserPrompt`.

### Task 4: Inline CSS and JS

**Files:**
- Modify: `lib/study-guide-service.ts`

- [ ] Add all new styles inside `guideCss()` using existing tokens.
- [ ] Add tab behavior inside `guideNavScript()`.
- [ ] Keep accordion behavior native with `<details>/<summary>` plus optional inline state styling; no second `IntersectionObserver`.

### Task 5: Verification

**Files:**
- Verify: `scripts/verify-study-guide-template.mjs`
- Verify: `package.json`

- [ ] Run `node scripts/verify-study-guide-template.mjs`.
- [ ] Run `pnpm build`.
- [ ] Review `git diff --check` and `git diff --name-only`.
- [ ] Confirm v1 compatibility is structural: v2 fields optional and renderers return empty string/links when arrays are absent.

### Post-Gate Notes

- `renderAccordions` keeps `.trace` outside `<details>`, which is functionally correct and keeps the origin badge visible after the native accordion body. The CSS indentation can look slightly offset because `<details>` owns `padding:18px 22px` and `.accordion-block .trace` uses `margin:0 22px 18px`; treat as a cosmetic alignment pass for 11.4.
- `comparison_tabs` accepts `tabs ?? tabelas` and `timelines` accepts `etapas ?? steps` as schema tolerance. Real generated guides will not populate these fields until 11.3 changes the prompt, so 11.2 validation must use a manual JSON fixture/smoke, not live generation.
- `renderV2Blocks` and the sidebar place v2 blocks after `Seções` and before `Glossário`. The internal v2 order is fixed as comparison tabs, accordions, timelines, then tables; custom editorial ordering is out of scope for 11.2 and can become a future requirement if needed.
