---
schema_version: 2
task_id: "003"
axis: engineering-quality
reviewer: claude-subagent-engineering-quality
review_run_id: "review-quality-003-claude-subagent-r1"
package_id: "pkg_9d1a7efcdaebf446cdc0ebd7"
fixed_point: "73f50868fbc7e6a866ca3a6f0461f360193689844d96ff7345323da10bafe048"
result: PASS
blocking_findings: 0
reviewed_at: "2026-09-26T17:09:17.000Z"
---

```json
{
  "summary": "The package diff.patch was empty because base_commit == git_head (5d05223), so I reviewed the commit-range patch c563eb6..5d05223 (excluding .agent/specs) instead, and read the HEAD versions of the chat route and ChatPanel for context. Security posture holds. The PDF route builds the path only from the DB filename and serves only a file registered to a non-trashed Zetel. It is guarded against traversal (resolve + startsWith(dir+sep)) and symlinks (realpath). Foreign, missing and non-PDF files all get the same 404, and the response carries nosniff, no-store and CSP sandbox headers. Chat focus is authoritative on the server: the client sends only fileId/pageNumber, and text and hash come from pdf_pages. Forged content is ignored, and focus is rejected when combined with pageIndex or guia-estudo. Logs carry only IDs, counts and error codes, and meta persists only IDs, page number and hash. The Markdown/Guia flow is unchanged when no focus is sent: meta fields are the same and no source block is added. An integration test covers this. The adversarial tests cover cross-Zetel access, traversal, symlinks, trashed Zetels, forged content, delimiter/sentinel injection and malformed focus. Validation evidence reports focused tests, build, test:ci and coverage as PASS at this HEAD. I did not re-run any suite. No blocking issues. The main non-blocking issue is over-greedy <fonte> stripping, which can silently drop page text from the prompt.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "FONTE_TAG regex can silently delete large spans of legitimate page text",
      "location": {
        "file": "lib/chat-prompt.ts",
        "line": 748,
        "not_applicable_reason": null
      },
      "evidence": "The regex is /<\\s*\\/?\\s*fonte\\b[^>]*>?/gi, and [^>]* with an optional '>' consumes everything up to the next '>' or the end of the text, across newlines. Reproduced with node: 'Se T < fonte quente, o calor flui.\\nParágrafo seguinte...\\nFim.' becomes 'Se T '. 'fonte' is a common Portuguese word, and '<' is common in math/physics PDFs, so the rest of the focused page can vanish from the model's context with no signal.",
      "recommendation": "Only remove complete, well-formed delimiters, for example /<\\s*\\/?\\s*fonte\\b[^<>\\n]{0,200}>/gi. Alternatively, escape '<'/'>' of any fonte-like token instead of deleting. Add a unit test showing that 'x < fonte ...' text without a closing '>' is preserved."
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Reader render error is sticky across page changes",
      "location": {
        "file": "components/PdfReader.tsx",
        "line": 498,
        "not_applicable_reason": null
      },
      "evidence": "setError('Falha ao desenhar a página do PDF.') is never cleared when a later page renders successfully. The render effect does not reset error, and only the document-load effect does. One bad page leaves the error banner visible for the rest of the session.",
      "recommendation": "Call setError(null) at the start of the page-render effect, or keep the render error in its own state keyed by pageNumber."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "PDF route buffers the whole file in memory with no size cap or range support",
      "location": {
        "file": "app/api/zetels/[id]/files/[fileId]/pdf/route.ts",
        "line": 171,
        "not_applicable_reason": null
      },
      "evidence": "readFile(file.path) loads the entire PDF into a Buffer and copies it into a Uint8Array for each request. There is no Accept-Ranges header, so pdf.js downloads the full file before rendering. Large textbooks mean high memory use and a slow first page. This is local-first, so there is no security impact.",
      "recommendation": "Stream the file (fs.createReadStream wrapped in a web ReadableStream) and optionally support Range/Accept-Ranges so pdf.js can load progressively. Otherwise document the size assumption and rely on the ingest size limit if one exists."
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "No component-level tests for the client PDF study view or the ChatPanel focus payload branch",
      "location": {
        "file": "components/ChatPanel.tsx",
        "line": 487,
        "not_applicable_reason": null
      },
      "evidence": "The server side is well covered. PdfStudyView, PdfReader (page clamping, input commit, focus propagation) and ChatPanel's pdfFocusRef branch have no tests. Nothing checks that the payload drops pageIndex/readingMode and sends the current page, including in the voice path, which relies on the ref.",
      "recommendation": "Add a focused component test that mocks fetch and checks the chat POST body in PDF view: focus is present, pageIndex/readingMode are absent, and pageNumber follows page changes."
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Note suggestions from PDF-focus turns carry no page provenance",
      "location": {
        "file": "app/api/zetels/[id]/chat/route.ts",
        "line": 319,
        "not_applicable_reason": null
      },
      "evidence": "With pdfFocus, pageIndex and pageAnchor stay null, so a note suggested in a PDF turn is saved without paginaOrigem even though focusFileId/focusPageNumber are known in the message meta.",
      "recommendation": "If citations and provenance are planned for a later task, record that there. Otherwise pass the PDF file and page to the note suggestion."
    }
  ]
}
```
