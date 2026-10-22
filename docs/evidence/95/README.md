# Summary evidence coverage

Summary selection reserves twelve passage slots for recent documents and up to eight for each historical topic. Recent documents share their slots in source order. Duplicate topic matches release capacity for additional recent passages. The prompt retains its limit of 36 passages.

## Regression checks

`tests/test_health_summary.py` covers a recent document with sixty passages alongside twenty-four older topic passages. All older topic passages reach the prompt. A second case checks source sharing and duplicate removal. API checks verify the selected document count and passage count after saving and reloading. A migration check preserves an existing summary with unknown coverage.

The focused Python run passed 33 tests and 11 subtests across summaries, notebook chat and documents. The JavaScript suite passed 191 tests.

## Browser checks

An isolated local workspace contains the repository's synthetic sample records. A fixture replaces the model reply while retaining the application request, selection, citation, storage and rendering paths. The browser displays excerpts from 22 of 47 documents. Regeneration and reload preserve the counts. A citation opens its document. A legacy response displays “Document coverage unavailable”. The browser reports no JavaScript exceptions during these checks.

The layout-audit skill checked 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in light and dark themes. Both final reports contain zero failures and zero warnings. The audit excludes the decorative rail canvas because navigation intentionally appears above it. The citation control has a 44-pixel horizontal target and a 44-pixel vertical target through its pseudo-element.

Local reports: `/tmp/stellis-review-summary-light/report.md` and `/tmp/stellis-review-summary-dark/report.md`. Screenshots remain beside those reports.

## Execution bounds

Selection averaged 4.57 milliseconds across 100 calls on the 47 readable sample documents. The selector reads passages once and performs three local ranking queries. The change adds no model requests or downloads. Citation support validation remains tracked in issue #92.
