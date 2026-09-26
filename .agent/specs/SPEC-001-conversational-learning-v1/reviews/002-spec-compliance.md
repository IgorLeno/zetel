---
schema_version: 2
task_id: "002"
axis: spec-compliance
reviewer: claude-subagent-spec-compliance
review_run_id: "review-spec-002-claude-subagent-r2"
package_id: "pkg_e5be2330472a5bffc931a4fa"
fixed_point: "ce2dca05a7ee09d2906b2afe53257b10294c504902566ad512bdd1007e6bcf1d"
result: PASS
blocking_findings: 0
reviewed_at: "2026-09-26T13:56:52.000Z"
---

```json
{
  "summary": "Round 2. At fixed point ce2dca05 the implementation still meets every task-002 acceptance criterion and invariant. .pdf is accepted, .md still works and other formats are rejected (diff.patch 211-222, 1354-1365). The original is copied unchanged (1351, 1395). pdf_pages is 1-based with sha256 content_hash and char_count (955-975, 1381-1382). pdf_sections comes from the outline (889-919, 1550-1558). page_count and extraction_status take ok/no_text/failed (357-381, 1413-1440). Reprocessing is idempotent (1398-1411). Removing a file cascades to the derived rows (1000-1017, 1442-1451). PDF JavaScript is not executed (1590-1604). Logs carry only IDs, counts, codes and names (309-312, 318, 326-330, 384-398, 1491-1509). The 50 MB limit is documented (13-15, 765-767). Migration 006 is unchanged and has no down step. getDb() stays the only DB entry point. The round-2 additions stay inside the task: page/total-text/time extraction limits with PdfLimitError (769-789, 952-968, 1606-1615), stopAtErrors:false, a generic drift error for fs read failures, and resetting the cached pdf.js import when it rejects. These are hardening of the approved extraction path, not new features. Nothing out of scope was added. Round-1 status: F001, F004 and F006 are RESOLVED and verified in the diff. F002 is NOT_APPLICABLE: the option is claimed not to exist in pdfjs-dist 6.x, the package cannot confirm this, and the JS non-execution test passes. F005 is NOT_APPLICABLE because the runner is outside the package. F003 stays OPEN as MINOR, since the repo has no route-level tests. Two new NITs.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "No test covers a Zetel whose only files are PDFs going through the process route (processZetel then renderZetel)",
      "location": {
        "file": "tests/integration/pdf/pdf-ingest-flow.test.ts",
        "line": 1453,
        "not_applicable_reason": null
      },
      "evidence": "The new test 'Zetel só com PDF processa pelo mesmo caminho da rota sem erro' (diff.patch 1453-1459) runs processZetel, which returns pagesCount 0 and filesProcessed 0 without throwing, then processPdfFiles, which fills 3 pdf_pages rows. That is the same sequence the /process route runs (diff.patch 80-81). The route does not chain renderZetel, and the Documento Técnico being Markdown-only matches SPEC D2 ('zetel_pages permanece exclusivo de Markdown').",
      "recommendation": "None."
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "NOT_APPLICABLE",
      "title": "pdf.js getDocument is not called with isEvalSupported: false",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 758,
        "not_applicable_reason": null
      },
      "evidence": "The module comment now says isEvalSupported no longer exists in pdf.js 6 because the new Function path for fonts was removed (diff.patch 758-759). The pdfjs-dist sources are not in the package, so this reviewer cannot confirm the claim directly. It is consistent with upstream removing eval-based glyph compilation, with the pinned version 6.3.289, and with the passing test that OpenAction/annotation JavaScript is not executed (1590-1604). Adding an option that does not exist would not harden anything.",
      "recommendation": "None for this task. If a future pdfjs-dist upgrade reintroduces an eval-related option, disable it explicitly."
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "The HTTP upload route's early 413 rejection and error mapping have no test",
      "location": {
        "file": "app/api/zetels/[id]/files/route.ts",
        "line": 45,
        "not_applicable_reason": null
      },
      "evidence": "Unchanged. The 413 guard (diff.patch 44-47) now uses the shared PDF_TOO_LARGE_MESSAGE (767), which removes message drift. The branch itself and the HTTP mapping for a rejected .txt or a fake .pdf are still not exercised. The writer says the repo has no route-level tests and that the underlying addFile limit is tested (1354-1365). The acceptance criteria hold through the service layer, so this is not blocking.",
      "recommendation": "Optionally add a route handler test that calls POST with a Request built from a FormData, in a follow-up or when route testing is introduced."
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "processPdfFiles reads the whole file without re-checking MAX_PDF_BYTES",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 316,
        "not_applicable_reason": null
      },
      "evidence": "processPdfFiles now marks any file over MAX_PDF_BYTES as failed without calling extractPdf, and logs only fileId, bytes and reason (diff.patch 316-321). The test 'PDF trocado no vault acima do limite vira failed sem passar pelo parser' covers it (1473-1480). The file is still read into memory before the check; see F008.",
      "recommendation": "None for the limit itself; see F008."
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "NOT_APPLICABLE",
      "title": "The package cannot confirm that migration 006 is transactional",
      "location": {
        "file": "migrations/006_pdf_pages.sql",
        "line": 1,
        "not_applicable_reason": null
      },
      "evidence": "The writer says lib/migrate.ts wraps each migration file in db.transaction. That file is unchanged and not in the package, so it falls outside the diff under review. The migration test goes through runMigrations (diff.patch 1179-1274 region), which is consistent with the claim.",
      "recommendation": "None."
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "RESOLVED",
      "title": "The per-file 'pdf processed' log also fires for files skipped because they were removed during extraction",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 384,
        "not_applicable_reason": null
      },
      "evidence": "Outcomes are pushed to 'persisted' only after the stillOwned check (diff.patch 359-360), and 'pdf processed' is logged only for persisted outcomes (384-391). The test 'arquivo removido durante a extração não é persistido' covers the skip path (1461-1471).",
      "recommendation": "None."
    },
    {
      "id": "F007",
      "severity": "NIT",
      "status": "OPEN",
      "title": "The extraction timeout is only checked between pages, so a single slow page is not bounded",
      "location": {
        "file": "lib/pdf-service.ts",
        "line": 956,
        "not_applicable_reason": null
      },
      "evidence": "The deadline is checked before each getPage and getTextContent call (diff.patch 956-958) but not during them, and not during extractSections (977). A hostile page or outline could take longer than timeoutMs. This is defensive hardening beyond the acceptance criteria, not a violation.",
      "recommendation": "Optionally race each page's getTextContent and the outline pass against the remaining budget, for example with Promise.race and a timer, and destroy the task when it expires."
    },
    {
      "id": "F008",
      "severity": "NIT",
      "status": "OPEN",
      "title": "A PDF over the limit that was swapped into the vault is still read fully into memory before the size check",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 306,
        "not_applicable_reason": null
      },
      "evidence": "processPdfFiles calls readFileSync(path) (diff.patch 306) and only then compares buf.length with MAX_PDF_BYTES (316). The statSync call just before it (305) already yields the size. The parser is correctly skipped, but an arbitrarily large file placed in the vault by hand is still loaded into memory and hashed.",
      "recommendation": "Use the statSync result to check the size before readFileSync, and mark the file failed without reading it. The content hash can stay null or come from a streamed hash."
    }
  ]
}
```
