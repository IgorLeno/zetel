Looking at the frozen diff systematically for engineering quality, testing correctness, security, and maintenance.

## Key Implementation Areas Reviewed

**1. Parser Correctness (parseCreateArgs, parseApproveArgs)**
- Sequential flag scanning replaces error-prone indexOf at lines 868-885 and 712-736
- Flag validation: presence check, value non-empty, non-flag, no duplicates, known flags only—all implemented correctly
- The parser correctly advances index by 1 for each flag-value pair
- Error handling preserves exit code 2 for usage via writeError helper

**2. Integrity Distinction (TAMPERED vs LEGACY_UNVERIFIED)**
- Line 938 (spec-status.mjs): `Object.prototype.hasOwnProperty.call(state.approval, 'integrity')` correctly distinguishes absence from presence
- Line 943-948: Absent integrity → LEGACY_UNVERIFIED or PENDING (correct)
- Lines 952-975: Present-but-malformed integrity (null, array, string, partial) → TAMPERED (correct)
- Test coverage at lines 1513-1518 includes six malformed mutations: null, array, string, manifest-string, digest-number, partial-envelope

**3. Legacy Reapproval Logic (lines 763-791)**
- `isRecognizableLegacyApproval`: Checks !hasIntegrity AND status=APPROVED AND approval.spec=true AND human-approver (correct)
- `resolveApprovalKind`: Handles absent kind (requires --kind), present kind (must match if --kind provided), and kind from request (correct)
- `legacyApprovalMetadata`: Preserves old approved_by/approved_at only if not null, adds migrated_at and reason (correct)
- Does NOT call assertTransition for reapprove, avoiding APPROVED→APPROVED fabrication (correct per requirement)
- Guard flow at lines 623-637: Rejects legacy without --reapprove, integral with --reapprove, and --reapprove without legacy—all gates implemented

**4. Task Coherence Validation (spec-artifacts.mjs)**
- Frontmatter parsing (lines 1168-1188): Checks delimiters, parses field:value, detects duplicates, validates id/title/blocked_by types
- Canonical table detection (line 1222): Exact header match `["ID", "Titulo", "Bloqueada por", "Status"]` and separator validation
- Cross-source comparison (lines 1136-1150): Validates title and blocked_by match across state.json, file frontmatter, and TASKS.md; detects divergence with clear messages
- Dependency validation (lines 1257-1262): Catches self-dependency and phantom dependencies; tracks knownIds from state
- Missing tasks directory handled at line 1365

**5. Substantive Content Validation**
- `hasSubstantiveMarkdown` (lines 1154-1165): Skips frontmatter, rejects whitespace/heading-only content, correctly identifies "## Objetivo" as non-substantive
- Test at line 1554 confirms rejection: "tarefa sem corpo substantivo"
- Empty artifact collection at line 1035 reports via readinessIssues

**6. SPEC-SUMMARY Handling**
- Remains excluded from manifest (HASHED_ROOT_ARTIFACTS at line 1037 only includes SPEC.md, PLAN.md, TASKS.md, tasks/)
- Test lines 1342-1352: Contextual change (content update without markers) doesn't invalidate digest; marker reopening still blocks approval
- Documentation updated at lines 63-68 (.agent/COMMANDS.md)

**7. State Mutations and Atomicity**
- All approve logic uses writeJsonAtomic with expectedRevision (line 689)
- Initial state creation passes expectedRevision: 0 to writeJsonAtomic (line 840) with explicit constant INITIAL_EXPECTED_REVISION
- Comment at line 832-833 documents revision 0 is precondition-only; persisted state starts at 1
- validateState called on next state before write (line 688)

**8. Error Contracts**
- writeError extracted to infra/write-error.mjs (lines 1296-1303) returns exit 2 for usage, 1 for others
- Usage errors properly classified: missing flags, unknown flags, malformed values, duplicate flags
- Help text updated (line 588): Now states "exit 0 apenas para APPROVED; exit 1 para PENDING, LEGACY_UNVERIFIED ou TAMPERED"
- .agent/COMMANDS.md clarifies the three non-APPROVED statuses return exit 1 and require approval_status field parsing

**9. Test Quality**
- Malformed parser: 10 cases at lines 1463-1484 with correct exit 2 and no created specs
- Reapproval: 5 scenarios including kind mismatch, missing --kind, human requirement, metadata preservation, atomicity
- Integrity mutations: 15 cases (6 new malformed + 9 existing field corruptions)
- Readiness validation: 7 non-substantive/structural cases including frontmatter issues
- Task coherence: Tests for title divergence, blocked_by divergence, duplicate dependencies, phantom dependencies, missing/extra tasks
- Legacy table format rejection (line 1663-1675): Noncanonical TASKS.md headers properly caught with actionable error

**10. Removed Dead Code**
- readTaskFrontmatter (lines 1050-1059 previously) had no external callers
- escapeRegex (lines 1276-1279 previously) had no callers
- Both correctly removed

**11. Backwards Compatibility**
- New reapprove and kind flags are optional
- Removed status alias in favor of workflow_status (line 920) preserves semantics
- Legacy approval detected without automatic migration—SPEC-000 remains LEGACY_UNVERIFIED (confirmed in gates)
- Initial task template now includes title field (line 848), consistent with coherence checks

**12. Documentation Updates**
- .agent/COMMANDS.md updated with ./agentctl examples, reapprove syntax, SPEC-SUMMARY clarification, trust boundary section
- .agent/STATE.md explains integrity presence/absence distinction and legacy_approval structure
- SPEC-SUMMARY.md updated with 002A status
- Errata added to 002-spec-compliance.md (lines 207-218) explaining mutation count correction transparently

**13. Gates Executed (from 002A-gates.md)**
- 89/89 focused tests pass
- pnpm build, test:ci (271 unit + 17 integration), test:coverage (288/288), typecheck all pass
- ./agentctl spec status SPEC-000-agent-workflow-pilot: exit 1 (expected), LEGACY_UNVERIFIED, no state modification
- No lock/temp artifacts

## Verification of Completeness

All six findings (F1–F6) implemented; all 18 CodeRabbit threads triaged with resolution; required test cases covered; gates pass; documentation consistent.

**No regressions identified.** Parser hardening prevents the documented malformed command cases. Reapproval path is explicit and guarded. Integrity validation distinguishes empty from invalid. Task validation is strict and comprehensive. SPEC-SUMMARY correctly excluded. Trust boundary documented. Tests are focused, isolated, and thorough.

VERDICT: **PASS**
