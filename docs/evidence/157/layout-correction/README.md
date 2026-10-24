# Notebook Brief UI correction

Ticket: [#157 — Notebook Brief](https://github.com/reversely/stellis-health-dev/issues/157). Owner feedback: align `../timeline-1280-light.png` with the style guide and demo; avoid overlapping icons, clashes and hardcodes. Status: implemented and browser verified.

References: [original evidence](../timeline-1280-light.png), [course and Levels demo](../../../refs/stellis-demo/scene-4-course-and-levels.png), [pregnancy demo](../../../refs/stellis-demo/pregnancy-timeline.png), [style guide](../../../ui-style-guide.md).

## Observed and corrected

- The former element-only screenshot scrolled the date underneath the fixed Add action. Add now owns an opaque toolbar surface; the corrected evidence includes full page context and ordinary viewport captures.
- Course, pending-item and chart layouts respond to the reading column's width, including the rail, instead of only viewport width. Long record titles wrap; narrow course bands and chart facts stack.
- Today's weekday and enlarged capsule have separate grid rows with a gap, replacing the negative margin.
- Source links use existing Tabler icons in separate flex slots beside wrapping text. Appointment sources use the calendar icon. Only successive pending rows have dividing rules.
- The empty meeting-summary prompt is omitted when the notebook already has Levels.
- Existing theme roles supply palettes, status blocks, dimensions and control states. Names, dates, quantities, counts, course markers, values and statuses remain derived from the real APIs and records. Demo values were not copied into product code.

## Validation

- `tests/browser/notebook_brief.mjs`: passes at 1280px and 390px in both themes. Covers dose strip, course values, pending order/status/source, Levels, chart selection, arrow keys, ranges, container wrapping, source-icon separation, capsule-label separation, long medicine titles, toolbar containment, no horizontal overflow and no page errors.
- `tests/browser/pregnancy_brief.mjs`: passes pending timeline, event dots, weeks/trimester, due-date source, booked-date save, timeline ending and dashboard dating, including the dark phone layout.
- `tests/test_notebook_brief.py`: 12 passed (`python-tests.txt`).
- `scripts/audit_ui_styles.py`: 35 stylesheets, zero component palette/corner literals (`style-audit.txt`).

`timeline-<width>-<theme>.png` captures the normal viewport. `notebook-brief-<width>-<theme>.png` captures the full page including Levels. Fixed phone navigation appears at the viewport's lower edge within a full-page image; the ordinary viewport is the reference for its placement. Pregnancy artifacts additionally exercise the shared strip/course/pending components.

The isolated fixture uses synthetic records with dates relative to the test day. The browser tests verify layout and existing data behavior, not model answer quality or new clinical calculations. The chart retains its existing data-series theme color instead of copying the prototype's red stroke.
