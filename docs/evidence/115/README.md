# Curated health catalogue verification

The implementation registers all 32 approved collections and 85 curated notebook templates. Add Notebook supports search, multiple selections, custom names and descriptions, confirmation, and the exact MedlinePlus attribution. Existing notebook identities and organization survive migration. CLM remains an optional future backend in [health catalogue](../../health-catalogue.md).

## Automated checks

The full Python suite passed 509 tests with four skips and 115 subtests. The focused catalogue, source, search and sorting run passed 24 tests with three subtests. After rebasing onto the shared control-style changes, the focused catalogue, intake, onboarding and sorting run passed 48 tests with one skip and three subtests. The catalogue suite also passed a regression for adopting a matching legacy notebook while preserving its records. All 191 JavaScript tests passed. The package build succeeded, and the wheel contains `stellis/health_catalogue.json`.

Coverage includes atomic activation, unknown IDs, repeat selection, preserved names and reassigned collections, custom notebook identity, archive and restore, account data isolation, and invalid feature preferences. A shared document retains one original and one accepted clinical fact while both notebooks retrieve its text and show the fact in their health context and timelines. Shared notes appear in each notebook's source list and contextual search. Historical, negated and unconfirmed note examples do not activate notebooks.

## Browser workflows

`tests/browser/health_catalogue.mjs` runs against an isolated authenticated account at 390 and 1280 pixels. It verifies no creation before confirmation, selection of several templates, custom names containing literal HTML, renaming, collection reassignment, description persistence, archive and restore, and shared note access. A cross-origin activation request receives 403. The source association regression uses the actual Add source interface and waits for its saved result before checking both notebooks. JavaScript exceptions fail the regression.

`tests/browser/onboarding_catalogue.mjs` verifies selection through the catalogue, persistence across reload, no notebook creation before approval, and creation on completion. It restores a populated synthetic recommendation state for layout review. Both browser scripts require a disposable account because they change notebook selections.

## Layout checks

Final audits cover catalogue browsing, custom notebook creation, notebook settings, the notebook workspace, empty onboarding review and populated recommendations at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes. Reports and screenshots remain in the worktree under:

- `.agents/catalogue-runtime/modals-light/report.md`
- `.agents/catalogue-runtime/modals-dark/report.md`
- `.agents/catalogue-runtime/workspace-light/report.md`
- `.agents/catalogue-runtime/workspace-dark/report.md`
- `.agents/catalogue-runtime/recommendations-light/report.md`
- `.agents/catalogue-runtime/recommendations-dark/report.md`

Every final report has zero layout failures and zero warnings. Modal audits exclude the inert page behind the native dialog; workspace audits exclude the decorative rail canvas. Screenshots were reviewed across widths and themes. The attribution link uses the dialog ink colour so the dark theme's light dialog keeps readable text. The catalogue keeps actions outside its scrolling contents. The populated onboarding cards use zero-minimum grid tracks and shrinking inputs to fit the narrowest width. An empty chat keeps its composer in document flow so it cannot cover introductory text.

The first page in a fresh browser logs the existing `/favicon.ico` 404. A separate network trace identifies that URL. Workflow regressions report no JavaScript exceptions.

## Execution measurements

Thirty authenticated local requests per endpoint, with four active notebooks and synthetic intake notes, measured:

| Endpoint | Median | 95th percentile | Response bytes | Added model calls |
| --- | ---: | ---: | ---: | ---: |
| Catalogue | 8.6 ms | 11.6 ms | 71415 | 0 |
| Recommendations | 15.4 ms | 24.2 ms | 1920 | 0 |

The benchmark ran on the development host while browser audits were active. It does not predict hosted latency or clinical classification accuracy. Recommendations use bounded opening excerpts and existing editable intake notes. Setup edit saves are debounced and completion flushes the current selection. Records sorting retains its existing inference call; the new catalogue and onboarding matcher add none.

## Scope boundaries

New notebook health views derive accepted facts, dated sources and measurement points from shared records. Registered progression and assessment capabilities require concrete implementations and supporting data before activation. Calendar behavior remains in the existing integration; this change does not fetch calendar providers from the health view. The matcher can miss synonyms or complex negation, so people retain access to the full catalogue and approve each notebook.
