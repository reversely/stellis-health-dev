# Local OCR and request timing

Records support English text recognition on a scanned PDF page or image through Tesseract. Each page records its text source, recognition status and revision. The original file remains available. People can correct machine-read text and save it with a revision check. A correction clears health facts derived from that page's previous wording. Existing summaries retain their saved snapshot until regeneration.

## Benchmarks

The built app image ran without network access as the unprivileged app user, with two CPUs and a 2 GB memory limit. The image uses Tesseract 5.5.0 and Leptonica 1.84.1. Each fixture ran three times. Page time includes the isolated worker, rendering, recognition and saving.

| Fixture | Median | Maximum | Word error rate |
| --- | ---: | ---: | ---: |
| Printed image | 255 ms | 265 ms | 0% |
| Scanned PDF | 368 ms | 376 ms | 0% |
| Scanned page in mixed PDF | 364 ms | 382 ms | 0% |
| Sample food diary photo | 347 ms | 367 ms | 0% |
| Sample appointment questions photo | 295 ms | 311 ms | 1.02% |
| Sample lab photo | 622 ms | 636 ms | Unmeasured |

The first five fixtures have reference text. The lab photo has selected-value checks and no complete reference transcript. These synthetic printed records do not establish accuracy on handwriting, skewed phone photos or other clinical records. `benchmark.json` contains the measured results. `scripts/benchmark_ocr.py` builds and runs the fixtures without storing recognized text in its report.

## Resource and privacy checks

The server permits one OCR worker across hosted account processes. Each worker has a 30-second deadline, a 768 MB address-space limit, a CPU-time limit and a file-size limit. PDF rendering caps the raster at eight million pixels and 4096 pixels per side. Image recognition rejects images above thirty million pixels and downsizes its working image. A timeout kills the worker process group, including Tesseract.

The PDF reader remains below major version 2. Version 2 imports layout-analysis models during initialization, which prevented the constrained worker from starting. The compatible reader removes those layout dependencies from the lockfile.

Tesseract and its English data use Apache License 2.0. Leptonica uses BSD 2-Clause. The image retains package copyright files. See [Tesseract's licence](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE), [language-data licence](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE) and `NOTICE`.

OCR traces contain timestamps, elapsed time, page number and character count. Agent requests without an existing trace receive start, model-request, model-reply and completion events. Existing traces retain their request context. Trace records omit prompts, replies, page text and file names. Settings shows Recent requests to the signed-in account while provider and model controls retain their operator restriction.

## Verification

The full Python suite passed 501 tests with two skips and 112 subtests. Additional authentication and origin checks passed in the focused security run. All 191 JavaScript tests passed. Regression tests cover page selection in mixed PDFs, recognition and correction conflicts, failure and retry, account isolation, unchanged originals, literal injection text, process-group timeout, metadata privacy and real recognition of a lab photo and scanned dose.

The browser regression runs at 390 and 1280 pixels in an isolated authenticated workspace. It reads the lab photo through Tesseract, saves a correction, reloads the document, checks the original bytes and verifies timed traces for a non-operator account. The browser reports no JavaScript exceptions. Run `tests/browser/document_ocr.mjs` with the layout-audit Playwright environment and an isolated test workspace.

Layout reports and screenshots remain under `.agents/ocr-runtime/layout-light` and `.agents/ocr-runtime/layout-dark` in the OCR worktree. The layout-audit run covers document and Settings routes at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels. The audit excludes the decorative rail canvas behind navigation.

Both final layout reports contain zero failures. Each report retains two warnings for the existing 20-pixel debug-data checkbox at phone widths. Its associated text label provides a larger click area; the OCR and trace controls use their existing 44-pixel targets. The authenticated audit reports no browser console errors on either route.
