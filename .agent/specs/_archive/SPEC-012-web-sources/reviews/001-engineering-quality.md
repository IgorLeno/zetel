---
schema_version: 2
task_id: "001"
axis: engineering-quality
reviewer: claude-subagent-security-engineer
review_run_id: "review-quality-spec012-001-r4"
package_id: "pkg_aa727456f8d8fcbc00ac7623"
fixed_point: "f56786f3ed554053e4c18b996042d59a6edcdf1f8ba03405eae43bab63d2190b"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-05T06:28:05.000Z"
---

```json
{
  "summary": "Round 4. I diffed the r4 package against r3. The delta is one line in lib/html-to-markdown.ts, where cell code becomes code.replace(/(\\\\*)\\|/g, (_m, bs) => bs+bs+'\\\\|'), plus a new unit test that parses the output with the real remark + remark-gfm + remark-math pipeline. F009 is RESOLVED. A run of n backslashes before a pipe becomes 2n+1 backslashes followed by the pipe. The GFM cell tokenizer consumes the first 2n as n escape pairs and then the final '\\\\|' as an escaped pipe, so the cell cannot close inside the code span, whatever the parity of the original run. The regex matches the whole run because a leftmost match starts at the run's first backslash. Backslashes not followed by a pipe are left alone. A lone backslash before any other character returns the tokenizer to plain content. Cells are always joined with ' | ', so a code span ending in a backslash cannot pair with a cell delimiter. Escaping adds no backticks, so the fence length computed from the original code stays valid. The test asserts no image node, the image text kept inside the inlineCode value, 'C:\\\\dir' exact, and 4 cells. The display-only trade-off, where '\\\\|' in cell code shows one extra backslash, is safe and acceptable. I found no regression in the delta. One note I could not verify inside the package: the test imports 'remark' and 'unist-util-visit', and package.json in this diff adds neither. They resolve today, since the gates passed, but they may be transitive (phantom) dependencies under pnpm. F001-F004, F008 and the 3fff::/20 part of F007 were resolved in earlier rounds and are omitted. F005, F006 and the remaining F007 parts are carried over as OPEN. There are no BLOCKING findings.",
  "findings": [
    {
      "id": "F009",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "Inline code in a table cell escaped '|' but not '\\\\' — a backslash before a pipe split the cell and re-enabled Markdown injection",
      "location": {
        "file": "lib/html-to-markdown.ts",
        "line": 159,
        "not_applicable_reason": null
      },
      "evidence": "Backslash runs directly before a pipe are now doubled and the pipe is escaped, so the GFM tokenizer always sees an escaped pipe. The writer reproduced the original bug, and the new test parses the output with the real remark-gfm and remark-math pipeline: no image node, the code value keeps the injected text, C:\\\\dir stays exact, and the table has 4 cells.",
      "recommendation": "None. Optionally, add 'remark' and 'unist-util-visit' as explicit devDependencies if they are not already declared, so the test does not rely on hoisting."
    },
    {
      "id": "F005",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Recursion and spread-argument limits on hostile HTML give only a generic 'crashed' error, and the conversion runs outside the timeout",
      "location": {
        "file": "lib/html-to-markdown.ts",
        "line": 114,
        "not_applicable_reason": null
      },
      "evidence": "This is unchanged and was left unfixed on purpose. The walker, findFirst, rawText and fromHtml still recurse without a depth bound. Math.max(0, ...arr) and stack.push(...children) still throw RangeError on very large arrays, including the inline-code fence spread. toSnapshot is still unwrapped, so such errors surface as the uncategorised 'web source import crashed'. That is safe: nothing leaks and the process does not crash.",
      "recommendation": "Use reduce instead of spread, push children in a loop, and wrap htmlToMarkdown in a categorised WebSourceError. Optionally, cap the depth or node count."
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Import route accepts a non-JSON content type (cross-site simple POST)",
      "location": {
        "file": "app/api/zetels/[id]/web-sources/import/route.ts",
        "line": 44,
        "not_applicable_reason": null
      },
      "evidence": "This is unchanged. request.json() parses a text/plain body, so a cross-origin no-cors POST can trigger imports of public URLs if the zetel id is known. Private ranges remain blocked. It follows the existing project pattern.",
      "recommendation": "Track project-wide: require Content-Type: application/json, or check Origin/Sec-Fetch-Site, on mutating local routes."
    },
    {
      "id": "F007",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Remaining address/transport policy notes (3fff::/20 part resolved in r2)",
      "location": {
        "file": "lib/web-fetch.ts",
        "line": 143,
        "not_applicable_reason": null
      },
      "evidence": "(b) Redirects from https to http are still followed, which is a silent downgrade that RNF1 does not forbid. (c) The addFile error message is still forwarded to the client on the assumption that it is always generic, and that cannot be verified inside this package.",
      "recommendation": "Consider rejecting https-to-http redirects. Add a test that addFile failure messages contain neither the filename nor the title."
    }
  ]
}
```
