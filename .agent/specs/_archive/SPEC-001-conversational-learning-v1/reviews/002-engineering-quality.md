---
schema_version: 2
task_id: "002"
axis: engineering-quality
reviewer: claude-subagent-engineering-quality
review_run_id: "review-quality-002-claude-subagent-r2"
package_id: "pkg_215b1ec8d5948dee78957882"
fixed_point: "ce2dca05a7ee09d2906b2afe53257b10294c504902566ad512bdd1007e6bcf1d"
result: PASS
blocking_findings: 0
reviewed_at: "2026-09-26T13:57:20.000Z"
---

```json
{
  "summary": "Round 2. I checked each claimed fix against diff.patch. The fixes are real. PDF_EXTRACTION_LIMITS and PdfLimitError add a page cap, a total-text cap and a wall-clock budget checked between pages, with a unit test for each limit (lib/pdf-service.ts, diff.patch 777-789, 930-968, 1606-1615). processPdfFiles now stats before reading, uses buf.length as the size, skips files over MAX_PDF_BYTES without parsing them, and wraps fs errors so the log carries only fileId and err.code before the generic drift message is thrown (diff.patch 298-321). Rejected dynamic imports are no longer cached (867-870). stopAtErrors is false (946). Only persisted outcomes are logged (384-391). The UI shows the PDF page count only when it is above zero (102). There is a single PDF_TOO_LARGE_MESSAGE (767), and titles are sliced by code point (856). New tests cover removal during async extraction (1461-1471; the test is valid because the file is read synchronously before the first await), a PDF-only Zetel (1453-1459) and an oversized file replaced in the vault (1473-1480). The evidence at the new fixed point shows all FULL gates passing. Still open, by the writer's choice: the process route can return 400 after a partial success (F003), CMap/standard-font data is not configured (F004), some adversarial and route tests are missing (F005), and the schema has no CHECK constraints (F009). New minor gaps: the time budget is not enforced inside a single page, the document open or the outline walk (F011), and the size re-check happens after the whole file is read into memory (F012). I could not confirm the isEvalSupported claim from inside the package, so F008 is marked NOT_APPLICABLE based on the writer's claim and the updated comment. There are no blocking defects.",
  "findings": [
    {
      "id": "F001",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "No resource bounds on PDF extraction beyond the 50 MB input size",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 926,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 777-781 defines maxPages 5000, maxTotalChars 20M and timeoutMs 120s. 952 rejects when numPages > maxPages, 956 checks the deadline before each page, and 967-968 enforces the running character total. processPdfFiles skips files over MAX_PDF_BYTES before the parser (316-321). The tests at 1606-1615 and 1473-1480 exercise every branch. The worker thread was an optional part of the recommendation; leaving it for a local single-user app is acceptable. The remaining time-bound gap is tracked separately as F011.",
      "recommendation": "None beyond F011/F012."
    },
    {
      "id": "F002",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "fs errors in processPdfFiles can leak absolute path/filename into logs and HTTP response",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 303,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 303-314: statSync/readFileSync are in a try/catch. It logs only { fileId, code } and throws the path-free driftError (289-293). The route's err.message logging (92-93) is unchanged, but the errors this service throws on these paths no longer contain paths. No test covers this catch branch (see F005).",
      "recommendation": "None required. A test that forces the read to fail (e.g., chmod 000 or replacing the file with a directory) would lock the behaviour in."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Process route can return 400 after Markdown was already committed",
      "location": {
        "file": "app/api/zetels/[id]/process/route.ts",
        "line": 80,
        "not_applicable_reason": null
      },
      "evidence": "Unchanged (diff.patch 79-93): processZetel commits, then `await processPdfFiles` can throw the drift error, and the route returns only { error } with status 400. The writer deferred this deliberately: re-running is idempotent and is the recovery path. Concurrent /process calls for the same Zetel can still interleave across the await.",
      "recommendation": "In a later task, return the Markdown result together with a PDF error field, and consider a per-Zetel in-process mutex."
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Extraction config may mark recoverable or CJK PDFs as 'failed'",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 932,
        "not_applicable_reason": null
      },
      "evidence": "stopAtErrors is now false (diff.patch 944-946), which resolves the recoverable-error part. No cMapUrl/cMapPacked or standardFontDataUrl is passed (932-947), so PDFs using predefined non-Identity CMaps will still extract poorly or not at all. The writer deferred this deliberately. Only Helvetica/WinAnsi fixtures exist.",
      "recommendation": "When CJK support is scheduled, pass cMapUrl (pdfjs-dist/cmaps/) with cMapPacked: true and standardFontDataUrl, and add a CMap fixture."
    },
    {
      "id": "F005",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Concurrency guard and several adversarial paths are untested",
      "location": {
        "file": "tests/integration/pdf/pdf-ingest-flow.test.ts",
        "line": 1461,
        "not_applicable_reason": null
      },
      "evidence": "New tests cover removal during extraction (diff.patch 1461-1471), a PDF-only Zetel (1453-1459) and an oversized replaced file (1473-1480). Still missing: an encrypted/password PDF (the extractPdf docstring at 921-925 promises it rejects), outlines deeper than MAX_OUTLINE_DEPTH or larger than MAX_OUTLINE_ITEMS (792-793), the fs-read failure branch (307-314), and the 413 route path (45-47). The repo has no route tests.",
      "recommendation": "Add an encrypted fixture expecting 'failed' / PasswordException, a deep-outline and a huge-outline fixture, and a test for a read failure. Route-level coverage can wait until the repo adopts route tests."
    },
    {
      "id": "F006",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Rejected dynamic import of pdf.js is cached for the process lifetime",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 867,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 867-870: `.catch` resets pdfjsPromise to null and rethrows.",
      "recommendation": "None."
    },
    {
      "id": "F007",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Hash, size and mtime may describe different file versions",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 305,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 304-315: statSync runs before readFileSync, and size = buf.length, so size and hash come from the same bytes and mtime is never newer than them.",
      "recommendation": "None."
    },
    {
      "id": "F008",
      "severity": "NIT",
      "status": "NOT_APPLICABLE",
      "title": "Defense-in-depth: set isEvalSupported: false",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 758,
        "not_applicable_reason": null
      },
      "evidence": "The writer says the option no longer exists in pdfjs-dist 6.x. The module comment now records this (diff.patch 758-759). I could not check the pdfjs-dist sources because they are outside this package, so this status rests on the writer's claim and is not independently verified.",
      "recommendation": "None, provided the claim holds. If a future pdf.js version brings the option back, set it to false."
    },
    {
      "id": "F009",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Schema does not constrain extraction_status or section ranges",
      "location": {
        "file": "migrations/006_pdf_pages.sql",
        "line": 1020,
        "not_applicable_reason": null
      },
      "evidence": "Unchanged (diff.patch 1019-1020). The writer is keeping the migration SQL exactly as in the approved PLAN.",
      "recommendation": "Consider CHECK constraints in a future migration if the PLAN is revised."
    },
    {
      "id": "F010",
      "severity": "NIT",
      "status": "RESOLVED",
      "title": "Minor inconsistencies in logging/UI and duplicated message",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 384,
        "not_applicable_reason": null
      },
      "evidence": "Only persisted outcomes are logged (diff.patch 336, 360, 384-391). The UI checks pdfPagesCount (102). There is a single PDF_TOO_LARGE_MESSAGE (767), used at 46 and 217. Titles are sliced by code point (856). The optional O(n^2) endPage change was not made, which is fine at these limits.",
      "recommendation": "None."
    },
    {
      "id": "F011",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Time budget is not enforced inside the document open, a single page or the outline walk",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 956,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 950-977: the deadline is checked only before each getPage. The call at 950 (`await task.promise`), each `getTextContent` (958) and `extractSections` (977, up to 5000 destination lookups) all run with no deadline. One hostile page or a very large outline can therefore take far longer than timeoutMs. Text for a single page is also built in full (959-964) before maxTotalChars is checked (968).",
      "recommendation": "Race task.promise, each getTextContent and extractSections against the remaining budget (Promise.race with a timer that calls task.destroy()). Check the deadline inside the outline loop too, and optionally cap raw per page as it is built."
    },
    {
      "id": "F012",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "Oversized re-check happens after reading the whole file into memory",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 306,
        "not_applicable_reason": null
      },
      "evidence": "diff.patch 305-316: statSync is called only for mtime, then readFileSync loads the entire file, and only afterwards is `buf.length > MAX_PDF_BYTES` checked. A file replaced out of band with a few hundred MB is fully buffered and hashed for nothing. Above about 2 GiB, readFileSync throws ERR_FS_FILE_TOO_LARGE, which the catch at 307-314 reports as drift and uses to abort processing of every PDF in the Zetel, instead of marking that one file 'failed'.",
      "recommendation": "Use the stat result already taken: if st.size > MAX_PDF_BYTES, record 'failed' (size from st.size, hash null or skipped) without calling readFileSync."
    }
  ]
}
```
