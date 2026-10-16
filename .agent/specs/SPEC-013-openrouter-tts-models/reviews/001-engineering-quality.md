---
schema_version: 2
task_id: "001"
axis: engineering-quality
reviewer: claude-subagent-security-engineer
review_run_id: "review-quality-spec013-001-r1"
package_id: "pkg_073a21b047a6b26de4e4de7b"
fixed_point: "674fdc7f2e1d92473d108ce1cdf197f421542b9c3b900a4da5929fa5a3e32965"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-16T21:57:30.000Z"
---

```json
{
  "summary": "Change is correct and safe on the reviewed axes. The OpenRouter key comes only from resolveOpenRouterCredential() (lib/config.ts is not in the diff), is sent only as a Bearer header to the hardcoded https://openrouter.ai/api/v1/audio/speech URL, and never appears in a log or a response. Upstream errors become OpenRouterTtsError(status), and the body is cancelled without being read. The route logs only chars/provider/model/status and now also strips the OpenAI upstream error body from logs, which it previously logged through err.message. Routing by catalog provider, 503 before any network call when the effective provider has no key, 502 with a generic message, tone dropped for non-instruction models without touching tts_instructions, a correct 44-byte WAV header (RIFF size 36+n, byte rate rate*2, block align 2, 16-bit mono), and the fallback to OpenAI legacy rules for unknown models are all implemented and unit-tested with fetch mocked. Validation evidence shows focused tests, typecheck, test:ci and diff-check all PASS. Remaining items are non-blocking: a stray .claude/launch.json in the change set, missing cancellation/timeout for the buffered OpenRouter call, no check of the success response's content type or size, and a few missing adversarial tests.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Unrelated .claude/launch.json is part of the task change set",
      "location": {
        "file": ".claude/launch.json",
        "line": 1,
        "not_applicable_reason": null
      },
      "evidence": "changed-files.json lists .claude/launch.json (status U) with a local dev-server config (pnpm dev --port 3001). It has nothing to do with TTS routing and is local tooling state.",
      "recommendation": "Exclude it from the task commit (leave it untracked or add it to .gitignore) so the vertical task stays scoped to SPEC-013 task 001."
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Buffered OpenRouter call has no timeout and ignores client abort",
      "location": {
        "file": "lib/openrouter-voice.ts",
        "line": 78,
        "not_applicable_reason": null
      },
      "evidence": "synthesizeSpeechOpenRouter calls fetch without a signal and then awaits res.arrayBuffer(). With the OpenAI passthrough, cancelling the response stream stops the upstream request. Here the full PCM is buffered first, so when the user presses Parar, or the client disconnects, the paid upstream generation still runs to completion. A stalled upstream holds the request with no upper bound.",
      "recommendation": "Accept an optional AbortSignal and have the route pass request.signal, combined with AbortSignal.timeout(...) via AbortSignal.any. Map an abort to the existing 502/499 path without logging content."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Success response is wrapped as WAV without checking its content type or size",
      "location": {
        "file": "lib/openrouter-voice.ts",
        "line": 91,
        "not_applicable_reason": null
      },
      "evidence": "Any 2xx response is wrapped in a WAV header: a JSON/HTML body, a zero-length body, or an odd byte count. A JSON body becomes audible noise. An empty body becomes a 44-byte WAV with no data, which the client plays as silence or fails to decode with no actionable error. The response size is also unbounded; the 4096-char input cap limits it only implicitly.",
      "recommendation": "Throw OpenRouterTtsError(502) when the content type is clearly not audio (for example, application/json) or when pcm.byteLength is 0. Optionally cap the response size. Add tests for both cases."
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Adversarial cases missing from tests: network rejection and OpenAI-model-without-OpenAI-key with an OpenRouter key present",
      "location": {
        "file": "tests/unit/voice/tts-route.test.ts",
        "line": 538,
        "not_applicable_reason": null
      },
      "evidence": "Upstream HTTP errors (500 OpenAI, 429 OpenRouter) are tested. No test covers fetch rejecting, for example with a TypeError whose message could contain a URL or host, to confirm the log holds only {provider, model} with no status or message. No test asserts that an OpenAI model returns 503 when only the OpenRouter key exists, which is the symmetric case to the existing test. The test titled 'mesmo com chave OpenAI' relies on an ambient env key that the test does not set explicitly.",
      "recommendation": "Add (a) fetchMock.mockRejectedValue(new TypeError('fetch failed https://openrouter.ai ...')), asserting 502 and logger.error called with exactly {provider:'openrouter', model}; (b) OpenAI model, OpenAI key absent, openRouterKey set, asserting 503 and that fetch is not called; (c) make the OpenAI key's presence explicit in the 'mesmo com chave OpenAI' test."
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Sample rate parsed from the upstream header is not bounded",
      "location": {
        "file": "lib/openrouter-voice.ts",
        "line": 29,
        "not_applicable_reason": null
      },
      "evidence": "pcmSampleRate accepts any positive integer from rate=. A value at or above 2^31 makes sampleRate*blockAlign exceed 2^32, and DataView.setUint32 wraps silently, producing a malformed header. The upstream is semi-trusted, so the impact is limited to broken playback.",
      "recommendation": "Clamp to a sane range (for example, 8000 to 192000) and otherwise fall back to 24000."
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "ttsDefaultVoiceFor is exported but unused by changed server code",
      "location": {
        "file": "lib/tts-options.ts",
        "line": 317,
        "not_applicable_reason": null
      },
      "evidence": "Neither the TTS route nor the settings route calls ttsDefaultVoiceFor. If the request body selects the Gemini model without a voice, and the saved or default voice is an OpenAI voice (for example, marin), the sample request is rejected with 400 instead of using the model's defaultVoice (Kore). The voice-resolution lines are outside the diff context, so this is inferred from the visible validation code.",
      "recommendation": "Confirm whether the UI always sends a voice with a model. If not, use ttsDefaultVoiceFor(model) as the fallback when no compatible voice is given, or document that the UI is responsible."
    }
  ]
}
```
