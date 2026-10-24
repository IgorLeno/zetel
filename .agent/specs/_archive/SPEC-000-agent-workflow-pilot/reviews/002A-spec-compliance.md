Now let me read the complete frozen diff to conduct a thorough spec compliance review.

---

## SPEC COMPLIANCE REVIEW: TASK 002A

**Reviewer**: Reviewer A (Spec Compliance)
**Date**: 2026-08-03
**Fixed Point**: `/tmp/002A-fixed.diff` (SHA-256: `5a4e7e2f3f4b5e63ad9a2663f3e609efaab9bec2b764f4d9b32dadbb4f4cb01e`)

---

### SCOPE VERIFICATION

**Authoritative request source**: `/home/plasma-test/.codex/attachments/c8077b51-949f-4b70-a876-b3bf01c7fd6c/pasted-text.txt`
**Task definition**: `.agent/specs/SPEC-000-agent-workflow-pilot/tasks/002A-spec-lifecycle-premerge.md` (status: VALIDATING, frozen before REVIEWING)
**Evidence**: Gate logs, findings resolution, frozen diff

---

### FINDING 1 — PARSER ESTRITO DE `spec create`

**Requirement**: Sequential validation rejecting all malformed cases with exit 2/`guard: usage`.

**Implementation** (frozen diff):
- **`scripts/agentctl/commands/spec-create.mjs:856–889`**: Replaced `indexOf` with sequential flag loop (lines 868–884). Validates:
  - Flag presence in set `{--kind, --title}` only (line 871)
  - Value presence and non-empty (line 874)
  - No value starting with `--` (line 874)
  - No flag duplication (lines 878, 881)
  - Both flags mandatory (line 886)
  - Kind ∈ {mini, full} (line 887)
- **`scripts/agentctl/infra/write-error.mjs`**: Centralized error exit (returns 2 for `guard: usage`, 1 else).
- **Tests** (spec-lifecycle.test.ts:1463–1491): 10 malformed cases + inverted order + quoted title.

**Verification**: ✓ All six requirements met. Exit 2 confirmed for 10 cases; order-independent; spaces preserved.

---

### FINDING 2 — REAPPROVAL LEGADA EXPLÍCITA

**Requirement**: `--reapprove` flag, kind resolution, legacy metadata preservation, no state-machine APPROVED→APPROVED, atomic revision increment.

**Implementation** (frozen diff):
- **Parsing** (spec-approve.mjs:719–731): `--reapprove` and `--kind` flags with duplication/value checks.
- **Legacy detection** (spec-approve.mjs:762–768): `isRecognizableLegacyApproval()` checks status='APPROVED', no integrity, valid approval metadata.
- **Mode contracts** (spec-approve.mjs:623–640):
  - Normal: no `--reapprove`, status READY_FOR_APPROVAL, no integrity → proceeds
  - Legacy: `--reapprove` required (line 623–627)
  - Integral: `--reapprove` forbidden (line 631–633)
  - Reapprove without legacy: rejected (line 634–636)
- **Kind resolution** (spec-approve.mjs:770–780): Validates matching or supplies from flag.
- **No transition** (spec-approve.mjs:656): `assertTransition` skipped for reapprove (correct—no state change).
- **Metadata** (spec-approve.mjs:783–791): `legacyApprovalMetadata()` preserves prior `approved_by`, `approved_at`, `status`, adds `migrated_at`, `reason: integrity-envelope-migration`.
- **Atomic write** (spec-approve.mjs:87): `writeJsonAtomic(..., { expectedRevision: state.revision })`.
- **Tests** (spec-lifecycle.test.ts:1593–1676): Legacy without kind, with kind, kind mismatch, human confirmation, metadata preservation, atomicity.

**Verification**: ✓ Legacy reapproval contract fully implemented. SPEC-000 not reapproved (confirmed by gates: fingerprint identical, exit 1 LEGACY_UNVERIFIED).

---

### FINDING 3 — INTEGRITY AUSENTE vs. MALFORMADA

**Requirement**: Distinguish absence (legacy/pending) from presence-but-invalid (TAMPERED).

**Implementation** (frozen diff):
- **Detection** (spec-status.mjs:938): `hasIntegrity = Object.prototype.hasOwnProperty.call(state.approval, 'integrity')`.
- **Absence logic** (spec-status.mjs:943–950): No integrity → legacy if APPROVED/spec=true, else PENDING.
- **Invalid logic** (spec-status.mjs:951–975): Presence but invalid (null, array, string, manifest malformed, digest type wrong, partial envelope) → TAMPERED.
- **Tests** (spec-lifecycle.test.ts:1513–1518): null, array, string, manifest="string", digest=42, partial envelope.

**Verification**: ✓ hasOwnProperty usage correct. All malformed cases return TAMPERED. No false negatives.

---

### FINDING 4 — READINESS & COERÊNCIA MATERIAL

**Requirement**: Substantive content, frontmatter parsing (delimited only), canonical table, coherence ID/title/blocked_by, no retroactive template for legacy.

**Implementation** (frozen diff):

**Substantive validation**:
- **hasSubstantiveMarkdown()** (lines 1155–1165): Skips frontmatter block, rejects empty/whitespace-only/heading-only files.

**Frontmatter parsing**:
- **parseTaskFrontmatter()** (lines 1168–1188): Reads delimited `---...---` block only. Rejects unclosed/missing. Parses scalar/array fields. Requires id, title non-empty; blocked_by array.

**Canonical table**:
- **parseCanonicalTaskTable()** (lines 1217–1248): Matches exact header `| ID | Titulo | Bloqueada por | Status |`, validates separator, parses rows. Rejects non-canonical; detects duplicate headers.

**Coherence**:
- **checkTaskCoherence()** (lines 1092–1152): Compares state.tasks ↔ task files ↔ TASKS.md for ID/title/blocked_by. Detects duplicates, phantom deps, self-deps. Enforces non-empty title in state (line 1131).

**Template sections**:
- **checkTemplateSections()** (lines 1075–1090): Validates required headings for kind (mini/full). Skipped for reapprove (legacy exempt).

**Tests** (spec-lifecycle.test.ts):
- Empty/title-only files (1547–1564)
- Missing/malformed frontmatter (1374–1391)
- Title/blocked_by divergence (1366–1401)
- Phantom/self deps (1413–1425)
- Missing tasks/ directory (1362–1366)
- Non-canonical table (1403–1411)
- Template sections required (1581–1591)

**Verification**: ✓ Substantive validation implemented. Frontmatter delimited parsing confirmed. Canonical table strict. Coherence comprehensive. Legacy exempt from template requirements.

---

### FINDING 5 — SPEC-SUMMARY EXCLUSÃO DO DIGEST

**Requirement**: Keep SPEC-SUMMARY out of manifest; document contextual changes don't invalidate; markers continue blocking.

**Implementation** (frozen diff):
- **Manifest exclusion**: SPEC-SUMMARY.md NOT in HASHED_ROOT_ARTIFACTS (spec-artifacts.mjs); only SPEC.md, PLAN.md, TASKS.md, tasks/*.md included.
- **Marker check**: Still collected in openMarkers (collectApprovalArtifacts:1034).
- **Test** (spec-artifacts.test.ts:1342–1352): Contextual change (no marker) → manifest unchanged, digest identical. Marker addition → openMarkers blocked.
- **Documentation** (COMMANDS.md:63–68): "artefato derivado/contextual, nao faz parte do digest material. Mudancas sem marcadores no resumo nao invalidam o digest."

**Verification**: ✓ SPEC-SUMMARY excluded from material digest. Markers block approval. Contextual neutrality tested.

---

### FINDING 6 — TRUST BOUNDARY

**Requirement**: Document detection scope (drift, added/removed, isolation) and non-scope (simultaneous tampering of artifacts + hashes + manifest + digest + state.json).

**Implementation** (frozen diff):
- **Documentation** (COMMANDS.md:97–106 "Limite de confianca do manifest"):
  - Detects: drift acidental, arquivo removido/adicionado, alteracao isolada, envelope incoerente
  - Does NOT detect: simultaneous change of artifacts + hashes + manifest + digest + state.json
  - Stronger guarantees: commit signed, assinatura destacada, attestation CI, digest external
  - No crypto implemented (per scope)
- **Test** (spec-artifacts.test.ts:1427–1432): Verifies documentation presence of drift/asymmetric detection/external anchors.

**Verification**: ✓ Trust boundary documented explicitly. Test confirms presence. Honest about limitations.

---

### ATOMIC STATE MUTATIONS & REVISION

**State.json mutations** (frozen diff):
- **spec-approve.mjs:87**: `writeJsonAtomic(..., { expectedRevision: state.revision })`
- **spec-create.mjs:835–839**: Initial write with INITIAL_EXPECTED_REVISION (0) for precondition; comment explains revision 1 is persisted state floor.
- **No manual JSON edits**: All state transitions use assertTransition (where applicable) + validateState + writeJsonAtomic.

**Verification**: ✓ Revision precondition (0 for creation) documented. Atomic writes with expectedRevision enforce concurrency safety.

---

### EXIT CODE CONTRACT

**Requirement**: Exit 0 only APPROVED; exit 1 for PENDING/LEGACY_UNVERIFIED/TAMPERED/operational failures; exit 2 for usage.

**Implementation** (frozen diff):
- **writeError()** (write-error.mjs:1296–1303): Returns 2 if guard='usage', else 1.
- **spec-create.mjs:20**: `return writeError(stderr, error)` captures exit.
- **spec-approve.mjs:94**: `return writeError(stderr, error)` captures exit.
- **spec-status.mjs**: Exit 0 for APPROVED (line 32: `return 0`), exit 1 for others (line 37: `return 1`).
- **CLI help** (cli.mjs:588): Updated to reflect "exit 0 apenas para APPROVED; exit 1 para PENDING, LEGACY_UNVERIFIED ou TAMPERED".

**Verification**: ✓ Exit code contract updated in documentation and code. writeError centralization preserves behavior.

---

### READ-ONLY STATUS GUARANTEE

**Requirement**: `spec status` never mutates state.json, revision, mtime.

**Implementation** (frozen diff):
- **spec-status.mjs**: No writeJsonAtomic, no revision increment, no file writes. Recalculates in-memory only (lines 941–950, 980–981).
- **Documentation** (COMMANDS.md:79–82): "recalcula o manifest e o digest atuais apenas em memoria... Nunca persiste o digest recalculado".
- **Gates** (002A-gates.md:21): Status run with LEGACY_UNVERIFIED; SHA-256, mtime, size of state.json identical before/after.

**Verification**: ✓ Read-only enforced. Gates prove no state mutation.

---

### SCOPE BOUNDARIES

**Out-of-scope verifications**:
- No changes to `app/`, `components/`, `lib/`, `migrations/` ✓
- No cryptographic signing, GPG, attestation ✓
- No new schema version, new approval status ✓
- No task lifecycle commands (task 003) ✓
- No global Markdown lock ✓
- No new npm dependencies ✓
- No parser beyond canonical task table ✓

**Files modified in frozen diff**:
- `.agent/COMMANDS.md`, `.agent/STATE.md`, `.agent/specs/SPEC-000-agent-workflow-pilot/{SPEC-SUMMARY.md, TASKS.md, state.json, tasks/002A-spec-lifecycle-premerge.md, tasks/003-task-lifecycle-gates.md, reviews/002-spec-compliance.md, reviews/002A-findings-resolution.md, reviews/002A-gates.md}`
- `scripts/agentctl/{cli.mjs, commands/spec-*.mjs, domain/spec-artifacts.mjs, infra/write-error.mjs}`
- `tests/unit/agentctl/{spec-artifacts.test.ts, spec-lifecycle.test.ts, spec-status.test.ts}`

All changes are within authorized scope (agentctl, tests, task documentation, spec meta-artifacts).

**Verification**: ✓ Scope boundaries respected.

---

### GATE PASSAGE & TEST EVIDENCE

**Gate results** (002A-gates.md):
| Gate | Status | Evidence |
|------|--------|----------|
| focused tests | ✓ exit 0 | 89/89 tests in 5 files |
| build | ✓ exit 0 | Next.js 15.5.18, 20/20 pages |
| test:ci | ✓ exit 0 | 271 unit + 17 integration |
| test:coverage | ✓ exit 0 | 288/288, thresholds met |
| typecheck | ✓ exit 0 | tsc no diagnostics |
| status SPEC-000 | ✓ exit 1 expected | LEGACY_UNVERIFIED, read-only |
| git diff --check | ✓ exit 0 | no whitespace errors |

**Test coverage** (focused on findings):
- Parser 10 malformed cases + order + spaces: 1463–1491 ✓
- Legacy reapproval 7 scenarios: 1593–1676 ✓
- Integrity malformed 6 types: 1513–1518 ✓
- Readiness 7 substantive cases: 1547–1564 ✓
- Frontmatter parsing 4 invalid cases: 1374–1391 ✓
- Coherence 3 divergence cases + phantom deps: 1366–1425 ✓
- TASKS.md canonical 2 cases: 1403–1411 ✓
- SPEC-SUMMARY non-digest 1 case: 1342–1352 ✓
- Trust boundary documentation 1 test: 1427–1432 ✓

**Verification**: ✓ All gates pass. Test coverage comprehensive.

---

### DOCUMENTATION ACCURACY

**COMMANDS.md updates**:
- Uses `./agentctl` consistently (lines 23–26) ✓
- Exit codes clarified (lines 11–12) ✓
- Reapprove documented (line 25) ✓
- --kind for legacy explained (line 59) ✓
- SPEC-SUMMARY digest exclusion explained (lines 63–68) ✓
- Trust boundary section (lines 97–106) ✓
- Legacy approval semantics (lines 92–95) ✓

**STATE.md updates**:
- Approval semantics section (lines 124–139) ✓
- Absence vs. presence distinction ✓
- Legacy metadata preservation ✓

**SPEC-SUMMARY.md**:
- Updated to reflect 002A in-progress status ✓
- Correct checkpoint description ✓

**TASKS.md**:
- Task 002A added with correct row (line 175) ✓
- Task 003 blocked by 002A (line 176) ✓
- Checkpoint during correction added (lines 184–192) ✓

**Errata in 002-spec-compliance.md**:
- Pre-merge errata noted (lines 210–218) ✓
- Corrects historical mutation count (9, not 14) without rewriting verdict ✓

**Verification**: ✓ Documentation updated consistently. No rewriting of historical evidence; errata noted.

---

### CRITICAL PATH VERIFICATION

**Parser strict contract**:
- ✓ Sequential validation, no indexOf
- ✓ Rejects 10 malformed cases
- ✓ Preserves order-independence
- ✓ Exits with guard:usage

**Legacy reapproval contract**:
- ✓ --reapprove required and sufficient
- ✓ Kind resolution: present → validate match; absent → required flag
- ✓ Metadata preserved in approval.legacy_approval
- ✓ No APPROVED→APPROVED state machine transition
- ✓ Revision incremented atomically
- ✓ SPEC-000 remains LEGACY_UNVERIFIED

**Integrity distinction contract**:
- ✓ hasOwnProperty for absence
- ✓ Invalid envelope → TAMPERED
- ✓ Legacy/PENDING vs. TAMPERED clearly separated

**Readiness contract**:
- ✓ Substantive validation (not just existence)
- ✓ Frontmatter delimited parsing
- ✓ Canonical table enforcement
- ✓ Coherence across state/docs
- ✓ Template sections for new (mini/full), not legacy

**SPEC-SUMMARY contract**:
- ✓ Excluded from material digest
- ✓ Markers still block
- ✓ Contextual changes don't invalidate

**Trust boundary contract**:
- ✓ Documented detection scope
- ✓ Documented non-scope (simultaneous tampering)
- ✓ Honest about external anchors needed

**Verification**: ✓ All critical paths verified. No deviations detected.

---

### FINDINGS TRIAGE ALIGNMENT

Checking findings resolution (002A-findings-resolution.md) against frozen diff:

| Finding | Classification | Frozen Diff Evidence | Status |
|---------|-----------------|----------------------|--------|
| F1 parser | VALID—IMPLEMENT | spec-create.mjs:856–889, spec-lifecycle.test.ts:1463–1491 | ✓ Complete |
| F2 reapproval | VALID—IMPLEMENT | spec-approve.mjs:614–791, spec-lifecycle.test.ts:1593–1676 | ✓ Complete |
| F3 integrity | VALID—IMPLEMENT | spec-status.mjs:938–975, spec-lifecycle.test.ts:1513–1518 | ✓ Complete |
| F4 readiness | VALID—IMPLEMENT | spec-artifacts.mjs:1075–1267, spec-lifecycle.test.ts:1547–1676 | ✓ Complete |
| F5 SPEC-SUMMARY | VALID—ADAPT | spec-artifacts.mjs (exclusion), COMMANDS.md:63–68, spec-artifacts.test.ts:1342–1352 | ✓ Complete |
| F6 trust boundary | VALID—IMPLEMENT | COMMANDS.md:97–106, spec-artifacts.test.ts:1427–1432 | ✓ Complete |

**Verification**: ✓ All findings implemented or adapted as classified. No skipped or rejected findings.

---

### BLOCKING FINDINGS ASSESSMENT

After exhaustive review of:
1. Authoritative request alignment
2. Implementation completeness per frozen diff
3. Test coverage and gate passage
4. Documentation updates and errata handling
5. Scope boundary respect
6. Atomic state mutations and concurrency safety
7. Exit code contracts
8. Read-only enforcement
9. Metadata preservation
10. Legacy approval without retroactive requirements

**Result**: **NO BLOCKING FINDINGS DETECTED**

All six core findings are correctly implemented, gates are green (89/89 tests, build, coverage, typecheck, status read-only, whitespace), documentation is accurate and updated, scope boundaries are respected, and test evidence supports all critical paths.

---

**VERDICT: PASS**
