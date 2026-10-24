# Colour blocks with inverted ink

Issue: [#152](https://github.com/reversely/stellis-health-dev/issues/152). Date: 2026-10-24.

## Change

`theme.css` defines block roles in the default, light and dark scopes: a neutral block (`--block-fill`, `--block-ink`, `--block-muted`) and alert, in-range, calculated and planned status pairs. Light pages use dark fills with light ink. Dark pages flip to light fills with dark ink.

The roles now serve the selected view tab, pressed filter pills, the *Accepted* fact tag, trend status (*above* and *below* use alert, *usual* uses in range) and the notebook citation open in the source viewer (`aria-current`, cleared when the viewer closes). `.status-block` gives later work one class for status labels.

## Evidence

`tests/browser/ui_consistency.mjs` passes 50 checks: the 48 existing route, theme and viewport cases, plus a block probe per theme. The probe resolves every pair through the live theme and asserts at least 4.5:1 contrast, and that ink is lighter than fill only in light mode.

| Pair | Light | Dark |
| --- | --- | --- |
| Neutral | 9.27 | 15.56 |
| Alert | 6.86 | 9.77 |
| In range | 6.23 | 9.88 |
| Calculated | 6.96 | 9.57 |
| Planned | 7.40 | 11.02 |
| Muted on neutral | 6.93 | 7.45 |

`scripts/audit_ui_styles.py` reports no component palette or corner literals. The screenshots show Trends at 390 px with synthetic readings: the alert block is dark wine with white text in light mode and pale coral with dark text in dark mode.
