---
schema_version: 2
task_id: "001"
axis: engineering-quality
reviewer: claude-subagent-security-engineer
review_run_id: "review-quality-spec016-001-r2"
package_id: "pkg_5b0069dd88c62c78d8bdd59f"
fixed_point: "a3d245cf8216e81eac59199bfabaa57031606c5ea906c8c8e14baf1c4e71b96c"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-17T12:51:01.000Z"
---

```json
{
  "summary": "PASS. The Gemini key is stored only in ~/.zetel/config (0600, atomic and locked) with an env fallback. It never appears in HTTP responses or logs and only ever goes from the browser to the server. Config line injection is blocked both in the route (whitespace, control characters, '=') and in writeConfig (CR, LF, NUL, '=' in the key), with adversarial tests. live_voice is validated before any voice write, so there are no partial voice writes, and /api/voice/status is additive. Focused tests re-run green (29/29). Four non-blocking observations: a new unhandled writeConfig exception path in PUT /api/settings, a strict key-format suggestion for writeConfig, the pre-existing missing origin check on the local POST routes, and the untracked .claude/launch.json.",
  "findings": [
    {
      "id": "EQ-001",
      "severity": "MINOR",
      "title": "writeConfig can now throw in PUT /api/settings and the call is not caught",
      "recommendation": "Reject CR/LF/NUL in these fields during validation, or wrap writeConfig and return 400. Add a test.",
      "status": "OPEN",
      "evidence": "default_model (line 122, after setSetting) and openai_tts_key (line 349, after the voice writes) call writeConfig without a try/catch. A value with an embedded CR/LF/NUL gives an unhandled 500 and a partial SQLite write. Injection is still prevented and no secret leaks. Same family as the known pre-existing write-before-validate behavior.",
      "location": {
        "file": "app/api/settings/route.ts",
        "line": 122,
        "not_applicable_reason": null
      }
    },
    {
      "id": "EQ-002",
      "severity": "NIT",
      "title": "writeConfig key format is not strictly constrained",
      "recommendation": "Enforce /^[A-Za-z_][A-Za-z0-9_]*$/ for keys.",
      "status": "OPEN",
      "evidence": "A key starting with '#' or with surrounding whitespace is dropped or normalised by readConfig. All current callers use constant keys, so this is not exploitable today.",
      "location": {
        "file": "lib/config.ts",
        "line": 53,
        "not_applicable_reason": null
      }
    },
    {
      "id": "EQ-003",
      "severity": "NIT",
      "title": "No same-origin/content-type guard on the local key-write POST (pre-existing pattern)",
      "recommendation": "In a later task, add an app-wide Origin/Sec-Fetch-Site or Content-Type: application/json check on mutating routes.",
      "status": "OPEN",
      "evidence": "request.json() accepts a text/plain cross-site simple POST, so a malicious page could replace the Gemini key with an attacker's key. /api/config has the same issue; this predates the change.",
      "location": {
        "file": "app/api/config/gemini/route.ts",
        "line": 21,
        "not_applicable_reason": null
      }
    },
    {
      "id": "EQ-004",
      "severity": "NIT",
      "title": "Untracked local launch config present",
      "recommendation": "Keep it out of the commit (gitignore or leave untracked).",
      "status": "OPEN",
      "evidence": "Known and out of scope: a local dev file that must not be committed.",
      "location": {
        "file": ".claude/launch.json",
        "line": 1,
        "not_applicable_reason": null
      }
    }
  ]
}
```
