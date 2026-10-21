---
schema_version: 2
task_id: "003"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-003-r2"
package_id: "pkg_568cc329da64a95b775a785e"
fixed_point: "efaef9baaa89af2c0c8737016e1a36cce2615e4ca070513a5502994ada1a17e1"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-21T14:55:48.210Z"
---

```json
{
  "summary": "Round 2 review of task 003 (channel report import), based on diff.patch, validation-evidence.json and docs/. F001, F002 and F003 from round 1 are fixed: scanZetelInbox hashes the bytes and consults the (zetel_id, channel_path, content_hash) identity through isKnown before UTF-8 decoding and parseReport, and caps reads at MAX_INBOX_REPORTS=200; tests cover rollback after addFile succeeded (trigger aborts the channel_imports INSERT; report copy and images removed), hard link, FIFO and the exact 20-image and 10 MB boundaries; PUT /api/settings writes channel_dir only after every other field validated. Security posture is solid: inbox/ and inbox/<slug>/ must be real directories (lstat plus realpath equality); files open with O_NOFOLLOW|O_NONBLOCK and are checked on the fd (regular file, nlink 1, size); reads are bounded and re-checked for growth; names pass closed regexes; images need magic bytes matching the extension, so SVG is refused; the link rewrite is verified by reparse; the SQLite transaction wraps addFile, the channel_imports INSERT, supersede and rejection of pending candidates, with vault undo through the written list. The route runs in Node under requireSameOriginJson, revalidates channel_dir on each use and logs only IDs and codes. Migration 012 is additive. No new BLOCKER or MAJOR. The F001 fix introduced one new MINOR (F006: the report cap also counts already-imported reports). F004 and F005 remain OPEN NITs. Validation evidence is all PASS for the same fixed point.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Full parse before idempotency check, no cap on reports",
      "location": {
        "file": "lib/channel-inbox.ts",
        "line": 224,
        "not_applicable_reason": null
      },
      "evidence": "readReport now computes the sha256 and calls isKnown(channelPath, hash) before UTF-8 decoding and parseReport. The service passes a prepared SELECT on channel_imports. scanZetelInbox enforces MAX_INBOX_REPORTS=200. Tests cover known-skip without parse and the cap.",
      "recommendation": "None. See F006 for a side effect of how the cap is counted."
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Missing tests for rollback after addFile, hard link, FIFO, boundaries",
      "location": {
        "file": "tests/integration/report-import.test.ts",
        "line": 171,
        "not_applicable_reason": null
      },
      "evidence": "The test 'falha depois do addFile (INSERT em channel_imports)' uses a BEFORE INSERT trigger and asserts no zetel_files row, empty arquivos/relatorios and imagens/relatorios, and that the simulated error text is absent from logs. channel-inbox.test.ts covers hard link, FIFO and the exact 20 images / 10 MB boundary.",
      "recommendation": "None."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "PUT /api/settings saved channel_dir before other fields were validated",
      "location": {
        "file": "app/api/settings/route.ts",
        "line": 381,
        "not_applicable_reason": null
      },
      "evidence": "channel_dir is validated early into a local variable and written only after all other validations, right before the 'Nada a salvar' check. A test confirms a 400 on another field leaves channel_dir untouched.",
      "recommendation": "None."
    },
    {
      "id": "F004",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Intermediate-directory TOCTOU between zetelInboxDir and file open (accepted residual)",
      "location": {
        "file": "lib/channel-inbox.ts",
        "line": 109,
        "not_applicable_reason": null
      },
      "evidence": "inbox/ and inbox/<slug>/ are verified by lstat/realpath and files are then opened by joined path; O_NOFOLLOW protects only the final component. Swapping a directory for a symlink in between requires local write access to the clone, which is already a trusted boundary.",
      "recommendation": "Optionally open the directory with O_DIRECTORY|O_NOFOLLOW and use openat-style access; Node does not expose this directly, so accepting the residual is reasonable."
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Revert to older hash is skipped while a newer version stays current; DB slug failing the regex gives 500",
      "location": {
        "file": "lib/channel-inbox.ts",
        "line": 106,
        "not_applicable_reason": null
      },
      "evidence": "The identity (zetel_id, channel_path, content_hash) is deliberately permanent per D6, so reverting a file to older content is skipped; documented by a test. zetelInboxDir throws a generic Error for a slug failing SLUG_RE, which the route turns into a 500; DB slugs come from slugify, so this cannot happen in practice.",
      "recommendation": "Keep as documented behavior; optionally count an invalid slug instead of throwing."
    },
    {
      "id": "F006",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Report cap counts already-imported reports, so new reports can be permanently refused after 200",
      "location": {
        "file": "lib/channel-inbox.ts",
        "line": 198,
        "not_applicable_reason": null
      },
      "evidence": "In scanZetelInbox, read += 1 runs before readReport, so reports already known (skipped by hash) consume the MAX_INBOX_REPORTS budget. Entries are sorted by name and date-prefixed names put the newest last, so once inbox/<slug>/ holds more than 200 report files every later report is marked too_many_reports on every run.",
      "recommendation": "Count against the cap only reports that go through parse, with a separate larger bound for hash-only reads, and update the test."
    },
    {
      "id": "F007",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Worst-case per-request cost remains high: up to 200 unknown 1 MB reports parsed synchronously and held in memory",
      "location": {
        "file": "lib/channel-inbox.ts",
        "line": 202,
        "not_applicable_reason": null
      },
      "evidence": "Each unknown valid 1 MB report takes about 2 s of remark time and scan.reports keeps every markdown string and parsed result until the import loop finishes. Impact is limited: the attacker needs control of the repo the user chose to clone, in a local single-user app.",
      "recommendation": "Optionally process reports lazily one at a time and lower the per-run parse budget, reporting the remainder as deferred."
    }
  ]
}
```
