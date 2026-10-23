# Maya Chen synthetic patient corpus

This folder contains 70 original medical PDFs covering five years of care for Maya Chen, a fictional Toronto woman born March 14, 1993. It includes the locked patient ledger, source research, per-document ground truth and longitudinal fixtures. Every generated medical record is labelled synthetic test data.

## Files

- `documents/2022/` through `documents/2026/`: 70 searchable PDFs
- `patient/canonical_facts.json`: the fixed source of clinical content
- `patient/chronology.json` and `patient/narrative.md`: dated events and story
- `manifest.json`: required content, file paths, layouts and direct source links for every document
- `research/`: source inventory, verified download hashes, licensing, specialty gaps and clinical guidance
- `ground_truth/`: per-document expected facts, source relationships, notebook associations and PDF hashes
- `fixtures/`: 32 selected menstrual-cycle logs, appointments and scheduling history, medications, observations and six original scripted appointment transcripts
- `validation/`: automated results, extraction checks and visual previews
- `generator/`: deterministic source-led rendering and fixture generation

## Clinical dates

One June 2024 retrieval yields 12 oocytes, 10 mature, 8 normally fertilized and 4 frozen blastocysts. One day-5 embryo is transferred November 15, 2024. ART-equivalent LMP is October 27; EDD is August 3, 2025. Maya gives birth July 29, 2025 at 39+2. Three embryos remain stored.

Dates through December 2026 are part of the requested fictional scenario, including dates after the corpus construction date. Bleeding logs distinguish natural menses, treatment withdrawal bleeding and postpartum lochia. Gaps in tracking are explicit.

## Source status

All 50 original John Snow Labs PDFs across Easy, Medium and Hard were downloaded, extracted and visually inspected. Its 21 output examples and 50 clean Root Cause Analytics PDFs were also inspected. Specialized cervical and initial prenatal testing-account reports and a synthetic prenatal serum screening report were verified. Fertility assessment references are explicitly synthetic. Other embryology and NIPT demonstrations have weaker provenance and are identified separately.

No fully synthetic populated obstetric ultrasound, follicular monitoring, delivery or postpartum PDF was verified. The affected manifest entries explicitly use generic synthetic imaging, procedural or discharge layouts and disclose this gap. Clinical guidance is a separate reference class. Source clinical inconsistencies are not copied into Maya's content.

Third-party PDFs and their identities, artwork and wording are excluded. Read `research/source_licenses.md` before reusing referenced templates. Root Cause Analytics sources have noncommercial terms; this corpus uses original layouts informed by ordinary document conventions and does not confer a commercial source licence.

## Rebuild

Use Python 3.11 or later, ReportLab and Pillow for rendering, and Poppler's `pdftotext`, `pdfinfo` and `pdftoppm` for validation and previews. Requests is used only for refreshing external source verification. No new runtime dependency is added to Stellis.

From the repository root:

```sh
python3 stellis-synthetic-patient/generator/build.py
python3 stellis-synthetic-patient/generator/build.py --validate-only
python3 stellis-synthetic-patient/generator/guide_data.py
python3 stellis-synthetic-patient/generator/build.py --package-only
```

`build.py` reads the locked canonical JSON. It writes the manifest and document-reference inventory before rendering, then fixtures, ground truth and validation. It fails if any required check fails. ReportLab uses invariant metadata and the ZIP uses fixed entry timestamps. `ledger.py` contains the original authored specification and can deliberately regenerate the lock; ordinary rebuilds do not modify it. Preserve the ledger checksum when comparing repeated ingestion runs.

Research inspection scripts document the research workflow and use downloaded inspection caches from the original session. Reproduction of the corpus does not require those caches or network access. `verify_sources.py` independently downloads the linked sources to refresh provenance checks without bundling them.

## UI guide

Choose **Take the tour** in the My Health library menu. Maya's story uses the existing docked tour panel and shared Add dialogs. Each step offers the next PDF in chronological order. Download it and select it through **Upload Record**. Choose an existing notebook or use **Add Notebook** to approve a template from the existing catalogue.

The app proposes an encounter date from labelled embedded or OCR text. Confirm or correct it in the shared date form. Ambiguous dates require review. **Check upload** compares the uploaded file SHA-256 and confirmed date with the locked corpus before enabling **Next record**. It creates no records automatically. Guide progress survives normal navigation and reload and is scoped to the signed-in account. **Close** stops automatic resume.

At clinical milestones the guide links to the existing Timeline and Ask Stellis controls and supplies a question about records uploaded so far. Inspect dates with the Documents and Notebook filters. Use the shared chat composer and check its source citations. Live replies require configured inference. Suggested notebook names map to existing catalogue templates. General history remains available when a person chooses no notebook.

## Browser validation and recording

`tests/browser/maya_guide.mjs` drives the visible file picker and date confirmation for all 70 documents. Set `STELLIS_MAYA_WORKFLOW=1` to also exercise catalogue selection, notebook context, timeline filters, source navigation and real cited assistant replies at the milestones. Run against an isolated disposable app. The workflow option requires configured inference and fails if a real cited reply is unavailable.

```sh
STELLIS_TEST_ORIGIN=http://127.0.0.1:8977 \
STELLIS_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
STELLIS_BROWSER=/path/to/chromium \
STELLIS_MAYA_WORKFLOW=1 \
node tests/browser/maya_guide.mjs
```

`STELLIS_MAYA_LIMIT` limits a diagnostic run. `STELLIS_MAYA_EVIDENCE` selects the evidence directory. The script saves JSON, screenshots and WebM video and verifies the video file exists. Use the FFmpeg build matching the installed Playwright version. Read `validation/browser/README.md` for completed checks and remaining limitations. Browser tests validate app behavior separately from clinical consistency.
