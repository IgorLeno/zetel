---
schema_version: 2
task_id: "002"
axis: engineering-quality
reviewer: claude-subagent-security-engineer
review_run_id: "review-quality-spec012-002-r1"
package_id: "pkg_c6bc461cd285bece797e7f27"
fixed_point: "76d63d7b16b02f7fa98babd853ed8c0e249aba9e411afcc80f67ba1b0f64a384"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-16T09:44:14.000Z"
---

```json
{
  "summary": "Reviewed diff.patch, changed-files.json, validation-evidence.json and docs/ only; the package has no changed/ directory, so the diff was the only source. Rule 3 holds. Search-mode import accepts only searchId and candidate ids. The URL and excerpt are resolved from a server-side in-process cache keyed by Zetel, with a 30-minute TTL and a cap of 100 searches. Client-supplied urls, snippet and candidates fields are ignored, and integration tests cover this. Content reaches zetel_pages only through the vault file and server-side processing. Cost limits are sound: exactly one OpenRouter call per search, no retry, max_tokens 400, max_results 8. The daily budget is reserved synchronously before the call, and the reservation happens only after body validation, the Zetel check and the key check. SSRF is preserved: candidate URLs go through the existing safeFetch. blocked_host and invalid_url are excluded from the excerpt fallback, and a test covers a candidate that resolves to a private address. Logs carry only IDs, counts, categories and status codes, and a test checks that the theme, URLs, domains, snippets and key never appear in logs. Snippets are escaped in markdown and rendered as text in React, and hrefs are limited to http(s). The Modal portal change is SSR-safe: useSyncExternalStore gives false on the server and during hydration, and the effect re-runs on isClient so focus still lands on the panel. No blocking defects found. The main gap is that the trusted-domain restriction in the default (non open-web) mode is delegated entirely to the provider and is not enforced or verified server-side. The rest are minor or nit items: budget consumed on failures that may cost nothing, re-import duplicates, multi-process assumptions, and small UX/a11y nits.",
  "findings": [
    {
      "id": "F001",
      "severity": "MAJOR",
      "status": "OPEN",
      "title": "Trusted-list restriction in default mode is not enforced server-side and depends on unverified provider semantics",
      "location": {
        "file": "app/api/zetels/[id]/web-sources/search/route.ts",
        "line": 568,
        "not_applicable_reason": null
      },
      "evidence": "With openWeb=false the route only passes include_domains (diff lines 568-575; plugin built at lib/web-search-service.ts diff line 1197). It then returns every parsed candidate, including those with trusted=false. No server-side filter applies when openWeb is false. The default list uses wildcard entries such as '*.gov' and '*.edu'. Whether the OpenRouter web plugin with engine exa accepts include_domains at all, and whether it understands that wildcard syntax, is not verified anywhere. The integration test at diff line 1415 only asserts the request body shape against a mocked fetch. Two failure scenarios follow. If the provider ignores include_domains, the default 'trusted list' mode silently behaves like open web and only the per-row badge reveals it. If the provider rejects or mis-matches '*.gov', all .gov, .gov.br, .edu and .edu.br sources are lost from default results.",
      "recommendation": "When openWeb=false, drop candidates whose trusted flag is false after parseSearchAnnotations, or at least count and report them, so the server enforces the contract whatever the provider does. Translate wildcard entries into the provider's accepted form, for example a bare suffix if that is what Exa expects, and document the mapping. Add a test where the mocked provider returns an off-list URL with openWeb=false and assert that it is filtered out."
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Daily budget is consumed by failures that cannot have incurred cost",
      "location": {
        "file": "lib/web-search-service.ts",
        "line": 1093,
        "not_applicable_reason": null
      },
      "evidence": "reserveDailySearch increments the counter before the call and never refunds it (diff lines 1087-1100). This is intentional for timeouts and 5xx errors. However, an invalid or revoked key (401), missing credits (402) and a local network failure before any request was sent (the fetch rejection at diff line 1219) also consume quota. A user with a misconfigured key can use up the whole day's budget while every call fails with no provider cost.",
      "recommendation": "Refund the reservation for failures that provably cost nothing: the 'network' code from the fetch rejection, and HTTP 401, 402 and 403. Keep it consumed for timeouts, 5xx and bad_response. Add one unit test per branch."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "A cached candidate can be imported repeatedly, creating duplicate files and downloads",
      "location": {
        "file": "app/api/zetels/[id]/web-sources/import/route.ts",
        "line": 122,
        "not_applicable_reason": null
      },
      "evidence": "The import loop resolves the candidate from the cache (diff lines 120-129) but never marks it as consumed. Only the UI prevents a second import, by disabling checkboxes for items already marked 'done' (WebSourcesDialog diff line 822). Repeating the POST with the same searchId and candidate ids within the 30-minute TTL, for example after a network error the client misreported or from a script, downloads the page again and stores another web-*.md file each time.",
      "recommendation": "Record the imported candidate ids on the cache entry and return an idempotent result, or the existing file, for repeats. Alternatively, dedupe by source_url per Zetel inside addFile or storeFile. Add an integration test that imports the same candidate twice."
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Budget atomicity and the search cache both assume a single server process",
      "location": {
        "file": "lib/web-search-service.ts",
        "line": 1114,
        "not_applicable_reason": null
      },
      "evidence": "The reserveDailySearch comment states that concurrency safety holds only within one process. Read and write are separate statements outside a transaction (diff lines 1094-1098). The search cache lives on globalThis (diff lines 1112-1118). If two Next servers run against the same SQLite file, for example dev servers on different ports, both can read count N and write N+1, which overshoots the cap. An import that lands on a process other than the one that ran the search returns 404.",
      "recommendation": "Wrap the read and increment in db.transaction, or use a single conditional UPDATE or UPSERT, so the cap holds across processes. Document the single-process assumption for the cache in ARCHITECTURE.md."
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Portaled Modal still lacks a focus trap, inert background and focus restoration",
      "location": {
        "file": "components/Modal.tsx",
        "line": 322,
        "not_applicable_reason": null
      },
      "evidence": "The portal change itself is correct for SSR and hydration: the server snapshot is false, the component renders null until hydrated, and the focus effect re-runs on isClient. However, because the modal now lives at body level, Tab can still move to the page behind it despite aria-modal=true. Focus is also not returned to the opener when the modal closes; it falls to body. Both gaps existed before this change and are not regressions. Separately, any CSS rule scoped to an ancestor of the old inline position no longer applies to the modal. That could not be verified from this package.",
      "recommendation": "Before closing, check visually that no modal styles depended on an ancestor selector. In a follow-up, set inert on the app root while a modal is open, or add a focus trap, and restore focus to document.activeElement captured at mount."
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Dialog reports non-JSON server errors as network errors, and a hanging search cannot be cancelled",
      "location": {
        "file": "components/WebSourcesDialog.tsx",
        "line": 690,
        "not_applicable_reason": null
      },
      "evidence": "The dialog calls res.json() unconditionally (diff lines 690 and 719). An HTML 500 page from the framework throws, and the catch block shows a 'network error' message. While a search is running, close is blocked through busyRef (diff lines 666-668), so the user waits up to 60 seconds (SEARCH_TIMEOUT_MS) with no way to cancel.",
      "recommendation": "Parse JSON defensively and fall back to the generic message for the endpoint. Optionally add an AbortController so the user can cancel a search; the budget stays consumed."
    },
    {
      "id": "F007",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Unrelated developer tooling file in the change set",
      "location": {
        "file": ".claude/launch.json",
        "line": 1,
        "not_applicable_reason": null
      },
      "evidence": ".claude/launch.json is untracked and pins the dev server to port 3001 (diff lines 462-478). It is local tooling that is unrelated to task 002. Including it widens the scope of the change, and a fixed port conflicts with the project's practice of detecting the dev-server port.",
      "recommendation": "Leave .claude/launch.json out of the task commit, or add it to .gitignore."
    }
  ]
}
```
