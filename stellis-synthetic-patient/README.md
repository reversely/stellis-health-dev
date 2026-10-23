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

## Maya’s story in Stellis

Choose **Take the tour** in the My Health library menu. The overview introduces Maya with her own avatar and shows life events, medical records and period history on parallel timelines. Start the demo to open an empty, isolated workspace. Each year opens a larger story dialog with Maya’s first-person situation, Stellis’s guidance and an action in the existing health interface.

The five files in `demo_packages/` are the demo upload units: `maya-2022.zip` through `maya-2026.zip`. Each contains that year’s original PDFs and a small package identifier. Upload each file in the dedicated **demo ZIP** box when that year introduces it. The complete corpus archive remains an archival deliverable; it is not an upload package.

Records initially remain unfiled. Encounter dates are prefilled from the existing text extraction/date-suggestion service, with page evidence for confirmation. Approve suggested notebooks explicitly; counts distinguish new notebooks from existing ones. Later years reuse the same notebooks and extend the saved history. Demo ZIP contents and PDF hashes are verified against the canonical corpus before records are created.

Maya logs periods, books appointments, opens actual report sources from the timeline, asks source-linked questions through the real chat composer, adds an estimated due date and later confirms the birth date. The story’s selected historical date is labelled in the demo banner. It affects frontend calendar/tracker views only. A tracking gap is recorded explicitly when selected periods resume; it is excluded from cycle-length averages.

Maya’s records, notebooks, appointments, tracking, conversations and derived data live in a separate workspace generation. **My records** returns to the ordinary account. **Clear demo** removes the demo generation in one action, including its progress and drafts. Ordinary records and drafts are retained. Demo inference uses the configured provider with demo source text and no managed workspace tools.

## Verification

Current UI evidence and the complete recording are in `validation/yearly_story/`. The corpus validation and older browser evidence are in `validation/`. The earlier individual-PDF walkthrough predates the yearly ZIP story and is historical evidence only. Live assistant answers require configured inference; scripted story dialogue is labelled and does not pretend to be an assistant response. Optical recognition accuracy and clinical answer quality remain separate from workflow validation.
