# Study shell redesign

Execution profile: FULL. The visual composition spans PDF, HTML reading, chat, and contextual navigation. Routes, persistence, and request payloads remain unchanged. The owner's explicit verification scope for this round is focused structural checks, `pnpm typecheck`, and `git diff --check`; visual evaluation is human.

- [x] Map current study layouts, chat actions, and relevant CSS.
- [x] Make PDF and reading views share a responsive study shell with a visual PDF/Chat switch that keeps the reader and chat mounted.
- [x] Reduce permanent navigation and chat controls; move sessions, profile editing, starters, and voice preferences into compact menus.
- [x] Refine conversation, composer, references, and contextual cards with existing theme tokens.
- [x] Verify callbacks and state continuity in code; run focused tests where useful, typecheck, and diff-check.
- [x] Review the diff and prepare the exact commit and push to `origin/main`.

Outcome: Both study views keep reading and chat surfaces mounted across visual mode changes. Session/profile/starter/voice/source/card callbacks remain connected to the same functions and payloads. Four focused test files passed (10 tests); `pnpm typecheck`, CSS parsing, and `git diff --check` passed. Browser appearance and interaction remain for the owner's evaluation.
