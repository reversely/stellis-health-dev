# Maya notebook and date review

The supplied screenshot exposed a visual defect missed by earlier geometry checks: catalogue row styles were scoped to another dialog, so reused checkbox labels appeared as crowded raw text. The fix shares the actual row layout, uses existing list-widget spacing and preserves theme controls. The screenshots compare the supplied state with desktop and narrow corrected views.

Seventy states pass geometry checks across seven widths and both themes. The targeted browser flow checks label-to-checkbox spacing, whole-row selection, empty selection disabling, notebook filing and New/Existing annotations. It confirms OCR/text-suggested dates remain prefilled and that confirming a report date creates no appointment. The shared document date form uses the same plain “Visit or test date” terminology. Seventeen Python date/import/isolation tests and 199 JavaScript tests pass.

Run `tests/browser/maya_notebook_review.mjs` and `tests/browser/maya_yearly_layout.mjs` against a disposable server with the documented Playwright environment variables. These checks need no inference request. The earlier full-year recording remains historical for these revised labels and rows.
