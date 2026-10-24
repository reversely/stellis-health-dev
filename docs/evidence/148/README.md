# Point at a report and ask Stellis

Issue: [#148](https://github.com/reversely/stellis-health-dev/issues/148), delivering the report-understanding interaction clarified under [#147](https://github.com/reversely/stellis-health-dev/issues/147). Date: 2026-10-24.

Implemented: original-page rendering with selectable source lines, automatic explanation on first selection, source-anchored follow-up questions, related-document retrieval, checked citation targets, persisted history, zoom/rotation, and historical-source warnings. The full document page keeps extracted text and corrections in a supporting disclosure. Existing notebook source previews retain their text view.

## Reference and design

The user explicitly clarified that sourcing information and understanding their report is the goal; an error-review queue is secondary. [Flath's Clicky article](https://isaacflath.com/building/how-clicky-works) describes an overlay pointer, screenshot coordinate transforms, speech questions and follow-up context. The previously inspected Clicky prototype is recorded in [the research ledger](../../research/clicky/README.md). This implementation adapts source selection and pointing within Stellis's own report rather than adopting the prototype's OS overlay or providers. The [GOPRELTO example](https://isaacflath.com/building/ocr-examples-gallery#goprelto-cocaine-hydrochloride-nasal-solution--prescribing-information) motivates keeping original report structure accessible. No interactive gallery parity is claimed.

## Evidence

- Python tests cover real PDF geometry at 0/90/180/270 degrees, raster output, real scanned-image OCR geometry, account isolation, authentication, cache identity, map/document binding, source-backed history and follow-ups, invalid citation rejection, source edits during inference and deletion of related sources.
- `tests/browser/report_context.mjs` exercises the full app with original PDFs and real SQLite: line selection, explanation, earlier-result citations, reload, source link navigation, zoom and rotation at 1280px and 390px, both themes, failed inference/retry and saved answers with AI unavailable. Screenshots here are from synthetic clinical records.
- The browser fixture in `tests/browser/report_context_server.py` replaces only AI response generation and its configured flag. It is not a product entrypoint. Actual model/provider quality is unverified: this shell has neither AI credentials nor a configured gateway. Citation validation checks supplied source identities, not clinical entailment.
- The targeted Python run passed 66 tests and 11 subtests across report context, documents, OCR, dates, notebook chat and chat attachments. Existing OCR text correction is independently exercised by `tests/browser/document_ocr.mjs`.

## Reproduction

Use an isolated `STELLIS_DATA_DIR`, `STELLIS_AUTH_MODE=open`, `STELLIS_REPORT_FIXTURE=/tmp/stellis-report-fixture.json`, and `PYTHONPATH=src:.`. Start `python -m uvicorn tests.browser.report_context_server:app --host 127.0.0.1 --port 8797`. Run `node tests/browser/report_context.mjs` with `STELLIS_PLAYWRIGHT_MODULE` pointing at an installed Playwright module and `STELLIS_BROWSER` at Chrome/Chromium. `STELLIS_REPORT_EVIDENCE` optionally records screenshots.

## Current limits

Selection is grounded to recognized text lines, including a table row when that is how the source groups text. Arbitrary chart points, freeform crops, report voice input and word-level table reconstruction are not implemented. Related context comes from saved text in this account's documents, with bounded excerpts; it is not an exhaustive search of all health data. Source coordinates/layout plus the original page context are supplied to the existing inference gateway. No new medical knowledge service or OCR model dependency was introduced. PDF text geometry and Tesseract TSV are the first adapters behind a versioned normalized result contract. Benchmarking a replacement engine, automatic purpose naming and fuller date/metric enrichment remain open in #147.
