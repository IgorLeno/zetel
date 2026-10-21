---
schema_version: 2
task_id: "002"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-002-r4"
package_id: "pkg_884acf454174bdb07390b5d2"
fixed_point: "701a7642f71eab8e6723e346d1c086a52adff46f109617766347a38ce5c8b163"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-21T13:36:46.613Z"
---

```json
{
  "summary": "Round 4. F011 is fixed and dropped. HARMLESS_HTML_PART_RE is now /<br\\s*\\/?>|<!--[^<>]*-->/gi, so a stripped comment cannot contain `<` or `>`. That rules out every HTML5 early comment end (`<!-->`, `<!--->`, `--!>`), and nothing can be hidden inside a stripped comment. I checked with node on string literals: `<!--><img src=x>-->`, `<!---><img src=x>-->` and `<!-- --!><img src=x> -->` leave non-empty residue (so raw_html), while `<!-- nota -->`, `<!-- a -- b -->` and `<!--- x --->` strip cleanly. Those are harmless, because a lone `--` does not close an HTML5 comment. Regression tests for all three payloads and for `<!--> ![[segredo]] -->` are in the diff. Because an allowed comment now cannot close early, masking html node ranges in checkNoEmbeds is also sound. The earlier fixes (F001-F007, F009, F010) are unchanged in this package. Only the accepted NIT F008 remains. Validation evidence (focused vitest, typecheck, diff-check, all PASS) is consistent with the STANDARD profile. Limitation: I did not run remark, because the review prompt forbids opening files outside the package; claims about which source becomes one html node rest on the CommonMark rules and on the test results recorded in the evidence.",
  "findings": [
    {
      "id": "F008",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Unquoted scalars keep trailing ' # comment' and accept YAML-indicator-like values (accepted by the author)",
      "location": {
        "file": "lib/report-format.ts",
        "line": 186,
        "not_applicable_reason": null
      },
      "evidence": "`title: Foo # nota` gives 'Foo # nota'. `zetel_report: 1 # v1` gives unsupported_version. Values starting with `-`, `?`, `,` or `:` are accepted unquoted, and tab indentation is accepted. This does not affect safety, because values stay within the closed subset.",
      "recommendation": "Optional: document in the template that inline comments are not supported."
    }
  ]
}
```
