# Trends organization and purple dark mode

Owner feedback: [#173](https://github.com/reversely/stellis-health-dev/issues/173). Reference inspected: [the supplied phone screenshot](../152/trends-390-light.png).

The supplied full-page image shows a fixed navigation bar crossing a long captured page, awkward date/source text, prominent red comparison pills and unrelated empty measurements under Start tracking. The owner also requires dark purple surfaces, never black.

## Implemented

- Stable categories: Vital signs (pulse, breathing rate, HRV, blood pressure, temperature), Body measurements (weight), Blood sugar (blood sugar and HbA1c), Sleep, Symptoms (pain). Unrecorded measures use plain rows and secondary actions within their category. Saving preserves the category.
- Semantic dates and separate Manual entry, Camera reading or record-title metadata; the overview and chart tooltip use the same source language. Personal-history comparisons use neutral purple/paper styling rather than red/green alert colors. Charts retain the shared teal series, a smaller plot, additional readable value ticks and date endpoints for short ranges.
- Shared purple surfaces: canvas #302638, cards/inputs #382C42, raised controls #44364E, header/navigation #2C2234. Media and calls use the same purple foundation. White primary and white-glass secondary controls remain consistent with the accepted dark-mode control rules.
- Mobile navigation has explicit full-width geometry and 72px safe-area-aware reserved space. The original image was a stitched full-page capture; live checks establish viewport placement while scrolling. The general UI audit now uses viewport captures for Trends so it does not repeat that misleading artifact.

## Verified

- `tests/browser/trends_layout.mjs`: eight layouts at 360, 390, 768 and 1280px in both themes; stable categories; no horizontal overflow or page exceptions; navigation anchored at the viewport bottom at three scroll positions; final action scrolls above it; 44px navigation/form controls; manual save, reload and table; form cancel in both themes, and Save visible above navigation immediately when a form opens. `checks.json` records the layouts and surface roles.
- `tests/browser/ui_consistency.mjs`: 50 route/theme/viewport checks pass across dashboard, Trends, records, summary, timeline, to-dos, settings, recording, chat, notes, notebooks and document views. Checks include contrast, touch targets, phone fields, secondary states, four goal-form states, focus, dialogs and overflow. `computed-styles.json` retains the audit results.
- JavaScript Trends and goals helpers: 28 tests pass. Shared UI stylesheet audit: 35 stylesheets, zero component palette/corner literals.
- Phone evidence uses actual 390×844 viewport screenshots at top, middle and bottom in both themes; desktop evidence uses 1280×844 viewports. These were visually inspected. All readings and accounts are synthetic. No provider inference or live camera estimates were needed for this UI change.
