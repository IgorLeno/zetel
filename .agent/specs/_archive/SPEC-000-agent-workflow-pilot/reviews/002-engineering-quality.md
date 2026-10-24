I don't have write access in this session, so I'll deliver the review directly as my response instead of via a plan file.

# Independent Review — Axis B: ENGINEERING QUALITY
## SPEC-000 / Task 002 — Spec Lifecycle (`agentctl spec create|approve|status`)

**Reviewer:** Fresh, independent Claude Code process (read-only).
**Baseline commit:** `54629823decbe6066a7c78bc1c8e380ed87a8fc9`
**Fixed diff:** `.superpowers/sdd/002-spec-lifecycle/claude-fixed-point-final.diff`
**Diff SHA-256 (verified):** `772b353aa802b600ff9a1802acf78586320295205e17da88c36f5317dd3d5b85` ✅ matches
**Authoritative request SHA-256 (verified):** `a65a91c3d3aee3b65cb205b00e30d7fb3dadafebd3e8f41fe0db2be5c5cf36aa` ✅ matches
**Scope:** Only the fixed diff's content plus its direct runtime dependencies (`state-machine.mjs`, `atomic-write.mjs`, `git-root.mjs`, `read-state.mjs`) were inspected. `002-gates.md` was the only reviews/ file read, per instructions. No spec-compliance report was received or inferred.

---

## VERDICT: **PASS**

No blocking engineering-quality defects were found. Correctness of the atomicity, durability, canonicalization, tamper-detection, and path-safety contracts all hold up under static analysis and are backed by targeted tests. All findings below are non-blocking (quality/maintainability/robustness observations), listed by severity.

---

## Summary of what was verified as sound

- **Atomicity of `spec create`:** stages a full tree in a sibling `mkdtempSync` directory and completes with a single `renameSync` (`scripts/agentctl/commands/spec-create.mjs:26-54`). On any failure inside the staging block, the staging directory is always removed (`rmSync` in the `catch`, line 51) — no partial tree is ever left at the destination path.
- **Durability of `state.json` writes:** `writeJsonAtomic` (`scripts/agentctl/infra/atomic-write.mjs:27-151`) uses an exclusive `wx` lock file, an `expectedRevision` optimistic-concurrency guard, a temp-file write with explicit `fsyncSync` before `renameSync`, and a best-effort directory fsync afterward, with a clearly documented rationale for not propagating directory-fsync failures. This is a correct and well-reasoned durability contract.
- **Path/ID safety:** `assertSafeSpecId` (`scripts/agentctl/domain/spec-id.mjs:3-21`) rejects non-alnum/hyphen characters, `..`, `/`, `\`, and control characters before any path is constructed, and is invoked consistently from `spec-create.mjs`, `spec-approve.mjs`, and `read-state.mjs`. Manifest entries are independently re-validated against traversal (`spec-integrity.mjs:19-30`, `isManifestEntry`).
- **Deterministic hashing/canonicalization:** `normalizeArtifactText`/`canonicalizeArtifact` (`spec-artifacts.mjs`) correctly normalize CRLF→LF and trailing newlines, and strip only the documented operational frontmatter fields from task files, leaving `id`/`title`/`blocked_by`/content protected. Manifest ordering uses `Buffer.compare` (`comparePortablePaths`) instead of locale-sensitive string sort — a correct, portable choice that avoids platform-dependent ordering bugs.
- **Tamper detection:** `spec status`'s `inspectApproval` (`spec-status.mjs:102-161`) correctly recomputes the manifest/digest and diffs it against the stored `approval.integrity` record, detecting removed, added, and modified artifacts, plus structural incoherence (`checkTaskCoherence`), without ever writing to disk.
- **Read-only guarantee:** `spec status`'s code path performs no `fs` write operations anywhere in `spec-status.mjs`; this is consistent with the test suite's fingerprinting assertions (`tests/unit/agentctl/spec-lifecycle.test.ts`) that prove byte-for-byte file/lock immutability across `status` invocations.
- **Testability:** the diff includes solid unit coverage for canonicalization/hash determinism (`tests/unit/agentctl/spec-artifacts.test.ts`) and broad integration coverage via the public `./agentctl` launcher for creation collisions, ID rejection, approval gating, tamper scenarios (modified/removed/added artifacts), legacy approvals, and lock non-interference (`tests/unit/agentctl/spec-lifecycle.test.ts`).

---

## Non-blocking findings

### 1. [Low] Dead code: two exports are never called anywhere
**Evidence:** `scripts/agentctl/domain/spec-artifacts.mjs:81` (`readTaskFrontmatter`) and `scripts/agentctl/domain/spec-artifacts.mjs:142` (`escapeRegex`) are defined and exported (the first) but have zero references in `scripts/` or `tests/` (confirmed via full-repo grep).
**Risk:** Maintenance liability — dead code with no test coverage can silently rot or hide a bug if later wired in without re-verification.
**Correction:** Remove both, or if intended for task 003, add a call site and tests now.

### 2. [Low] Inconsistent CLI argument strictness between `create` and `approve`
**Evidence:** `spec-create.mjs:69-79` (`parseCreateArgs`) locates `--kind`/`--title` via `flags.indexOf(...)` and never rejects unrecognized flags or duplicate occurrences of `--kind`/`--title` (extras are silently ignored). By contrast, `spec-approve.mjs:62-91` (`parseApproveArgs`) explicitly throws `guard: usage` on any unknown flag or a repeated `--confirm-human`.
**Risk:** `agentctl spec create ID --kind mini --title T --typo-flag x` succeeds silently instead of failing with a `guard`/`nextAction` error, which is inconsistent with the project's own convention (every other command path enforces strict argument validation).
**Correction:** Make `parseCreateArgs` reject unknown flags and repeated `--kind`/`--title`, mirroring `parseApproveArgs`.

### 3. [Low] Race-window error message quality (not a correctness/data-safety issue) in `spec create`
**Evidence:** `spec-create.mjs:30` (`existsSync(destination)`) and `spec-create.mjs:49` (`renameSync(staging, destination)`) are not covered by any lock spanning the whole operation. If two `spec create <same-id>` invocations race, the loser's `existsSync` check can pass, but its final `renameSync` will fail (POSIX `rename()` refuses to replace a non-empty directory) with a raw Node `ENOTEMPTY`/`EEXIST`-style error rather than the intended `StateMachineError` with `guard: spec-exists`. The `catch` at line 50-53 still cleans up the loser's staging directory and does not overwrite the winner's spec — so **no data loss or overwrite occurs** — but the surfaced message loses the friendly `guard`/`nextAction` contract for this specific race path.
**Risk:** Low; this is a narrow concurrent-invocation window not exercised by the test suite (which only tests the sequential double-invoke collision, `tests/unit/agentctl/spec-lifecycle.test.ts:1260-1266`).
**Correction:** Optional — wrap the check-then-stage-then-rename sequence with the same lock-file pattern used in `writeJsonAtomic`, or simply document this as an accepted limitation.

### 4. [Low] Redundant/confusing revision handling in `createSpec`
**Evidence:** `spec-create.mjs:43-48` — `initialState()` builds a template with `revision: 1`, that object is validated via `validateState`, then immediately spread with an override to `revision: 0` to satisfy `writeJsonAtomic`'s precondition for a not-yet-existing file (`{ ...state, revision: 0 }`, `expectedRevision: 0`), and the object `writeJsonAtomic` returns (now `revision: 1` again) is validated a second time.
**Risk:** None functionally — both validations pass and the final on-disk `revision` is correctly `1`. It is simply harder to read than necessary and could confuse a future maintainer about which revision value is authoritative at each step.
**Correction:** Optional clarity improvement — have `initialState()` return `revision: 0` directly (matching what's actually passed to `writeJsonAtomic`), or add a one-line comment explaining the override.

### 5. [Low] Coarse exit-code granularity for `spec status` approval states
**Evidence:** `spec-status.mjs:86` returns `approval.status === 'APPROVED' ? 0 : 1`, so `PENDING`, `LEGACY_UNVERIFIED`, and `TAMPERED` (computed in `inspectApproval`, `spec-status.mjs:102-161`) all yield the same exit code `1`.
**Risk:** Automation/CI that gates purely on exit code cannot distinguish "not yet approved" (routine, expected for in-progress specs) from "cryptographically detected tampering of a previously-approved spec" (a materially more serious integrity event) — arguably the primary signal the tamper-detection feature exists to provide. Documentation (`.agent/COMMANDS.md`) accurately describes this behavior, so code and docs are internally consistent; this is a design-signal observation, not a docs/code mismatch.
**Correction:** Optional — consider a distinct exit code (e.g. `3`) for `TAMPERED` if downstream automation will ever need to react differently to tampering versus routine pending state; otherwise document explicitly that callers must parse `approval_status:` from stdout to distinguish these cases (partially already true).

### 6. [Low] Duplicated `writeError` helper
**Evidence:** Identical `writeError` function bodies in `spec-create.mjs:81-86` and `spec-approve.mjs:102-107`.
**Risk:** Minor maintenance duplication; a future change to the error-format contract (`guard`/`nextAction` rendering) requires editing two places.
**Correction:** Optional — extract to a shared helper (e.g. in a small `cli-errors.mjs` or reuse from `domain/state-machine.mjs`).

### 7. [Low] No lock over source artifact files during `spec approve`'s hash computation
**Evidence:** `spec-approve.mjs:22-24` reads and hashes `SPEC.md`/`PLAN.md`/`TASKS.md`/`tasks/*.md` via `collectApprovalArtifacts`/`checkTaskCoherence` before the eventual guarded write at `spec-approve.mjs:52` (`writeJsonAtomic`, which only locks/guards `state.json`).
**Risk:** In theory, a file could be edited between the hash read and the `state.json` write, causing the recorded digest to reflect a transient state. Given this is a single-operator, human-triggered CLI (not a concurrent server process), and the task's stated requirement is specifically to guard the `state.json` write (not arbitrary source files), this is within the documented scope and low real-world risk.
**Correction:** None required; noted for completeness only.

---

## Requirements traceability (Axis B lens only)

| Engineering-quality dimension | Assessment |
| --- | --- |
| Correctness | Sound — canonicalization, digest, transition guards all verified logically consistent with tests |
| Security (path traversal, injection) | Sound — layered spec-id + manifest-path validation; no shell/eval injection surfaces found |
| Atomicity | Sound — temp-dir+rename for create; lock+revision+fsync+rename for state writes |
| Concurrency | Sound for `state.json` (optimistic revision + exclusive lock); minor race-window message-quality gap for `spec create` collisions (Finding 3) |
| Portability | Sound — byte-order path comparator, `/`-normalized manifest paths, standard Node APIs only |
| Testability | Strong — comprehensive unit + integration coverage via public launcher; minor dead-code gap (Finding 1) |
| Clarity | Mostly good; a few readability nits (Findings 4, 6) |
| Maintenance | Good separation (`commands/`, `domain/`, `infra/`); minor duplication/dead-code items (Findings 1, 6) |
| Error handling | Consistent `guard`/`nextAction` pattern throughout, with one asymmetry (Finding 2) and one race-path gap (Finding 3) |

---

## Overall conclusion

The implementation correctly satisfies the engineering-quality bar for this task: it is deterministic, offline, dependency-free, atomic where required, and its tamper-detection/canonicalization logic is both sound and well-tested. All identified issues are low-severity, non-blocking polish items suitable for follow-up rather than gate-blocking defects.
