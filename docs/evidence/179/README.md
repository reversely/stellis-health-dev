# Shared palette conformity

Ticket: [#179](https://github.com/reversely/stellis-health-dev/issues/179). Owner feedback: colours throughout remain nonconformant after #157/#160 layout changes. Status: implemented and browser verified.

References: [style guide](../../ui-style-guide.md), [accepted palette history](../../contrast-workspace-experiment.md), [demo observations](../../refs/stellis-demo/README.md), [previous #157 screenshots](../157/layout-correction/README.md), [previous #160 screenshots](../160/layout-correction/README.md).

## Corrected roles and rendered surfaces

| Element | Before | Corrected |
| --- | --- | --- |
| Light cards/panels | White | Paper #F7F5F6 |
| Light primary actions | #4E4357 | Approved mauve #413A48 |
| Light focus | #4E4357 | Approved teal #335C63 |
| Selected tabs/citation blocks | Action fill/ink | Actual text/surface inversion |
| Charts and dose marks | Separate OKLCH teal/green palettes | Shared #335C63 light / #45ADA8 dark |
| Dark body text | Pink-tinted #FFF8FF | Shared near-white #F7F5F6 |
| Notebook secondary buttons | Local purple fills | Shared white-glass secondary roles and states |
| Dark mobile navigation | Card purple #382C42 | Navigation purple #2C2234 |
| Icons on inverted actions | Could retain surrounding surface ink | Explicit colour inheritance from their own control |
| Dark auth primary action | White on light glass | Mauve with white ink |

The chart/dose roles now reuse established palette colours instead of treating arbitrary existing tokens as approval. Source links use the same readable teal pair. Existing semantic status pairs, input white, custom notebook colours and the specified dark canvas/card/raised palette are preserved.

## Browser evidence

- `palette_conformance.mjs`: exact computed-colour assertions on rendered body, task actions, action icons, selected tabs, panels, secondary glass, keyboard focus, chart strokes, dose bars, links and mobile navigation at 1280px and 390px in both themes. Also checks auth primary actions on both theme surfaces. Results: `palette-results.json`; screenshots: `palette-*` and `auth-*`.
- `ui_consistency.mjs`: 50 route/theme/viewport and contextual checks pass, covering contrast, control sizing, phone fields, secondary states, goal forms, focus, capture dialogs and overflow. Results: `shared-ui-audit.txt`, `computed-styles.json`, and route/capture screenshots. Records accepts a legitimate empty unfiled list; a fixture where all documents are already filed must not wait for a nonexistent row.
- `notebook_brief.mjs`: course strip/band, coming-up source/status, Levels, chart selection, keyboard/ranges, geometry, both themes and widths pass. Screenshots: `timeline-*`, `notebook-brief-*`.
- `notebook_ask.mjs`: source selection, citation viewer, include-and-ask, Add from and Records upload pass; both-theme responsive evidence is retained in `notebook-ask-*` and `notebook-chat-*`.
- 18 notebook JavaScript tests pass (`node-tests.txt`). All 12 Python Brief tests pass.
- `scripts/audit_ui_styles.py`: zero component palette/corner literals (`style-audit.txt`). This remains a source hygiene check; exact rendered palette assertions provide the conformity check it lacked.

Screenshot theme changes now disable transitions just as the real theme switch does, so artifacts do not freeze partially transitioned text or SVG colours.

## Limits

Fixtures use synthetic records; Ask uses deterministic model output. The auth colour check intercepts auth status to keep the real form visible in the open-mode fixture; it does not submit credentials or test authentication. Full-page screenshots include fixed navigation at its viewport position. None of these checks deploys the changes or establishes that a running hosted instance has refreshed its assets.
