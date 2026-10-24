# UI family consistency audit

Issue: [#150](https://github.com/reversely/stellis-health-dev/issues/150). Date: 2026-10-24. Status: implemented and browser verified in the isolated UI worktree.

The user requested a check of buttons, colours, spacing and other UI inconsistencies, including embedded values that bypass the established family. The reference is the repository's accepted [UI style guide](../../ui-style-guide.md), including the current working-tree decision to use neutral light surfaces and teal selection. This is a consistency pass, rather than an external reference recreation.

## Findings and changes

| Finding | Change |
| --- | --- |
| Legacy player, transcript, editor and AI rules contain the earlier blue/white palette. | Theme roles now supply their colours, including before a later component override applies. The obsolete initial palette was replaced with the current house fallback. |
| Document actions, attachments and adjacent manual/table trend actions do not share secondary states. | Shared secondary fill/ink/border/hover/disabled/radius roles cover these controls. Manual and table actions are explicitly compared in the browser. |
| Repeated primary controls have different padding and corners. | Shared task padding, gap, target height and action radius; distinct control/panel/dialog/message/tab/pill roles preserve the intended hierarchy. |
| Page/component spacing includes many one-off 10/14/18px gaps and paddings. | Shared spacing steps and page gutter roles replace recurring values; small off-scale spacing moves to the adjacent documented step. |
| Document headings use the body family while other detail pages use Piazzolla. | Detail document titles use the shared page-title size and heading family. Body/heading family references are centralized. |
| Glass/paper contexts inherit dark-page disabled/status colours and a white fallback chevron. | Recompute those roles in context; original report hit regions retain their fixed-paper focus colour. |
| Record movement, range selectors, composer scope, editor toolbar and populated goal actions have smaller standalone targets. | Normal controls meet the 44px role, auth submit remains 48px and equal-width capture choices remain 56px. Phone fields remain at least 16px. |
| A mid-tone notebook background can leave both house inks under 4.5:1; date opacity further reduces contrast. | Keep a house ink when it passes, otherwise use full white/black; keep notebook dates at full ink. Property coverage checks 4,096 representative backgrounds. |

[source-audit.json](source-audit.json) compares the merged-main baseline with this change: 31 stylesheets, 232 component colour literals and 167 corner literals reduced to zero outside the central catalogue. Shared spacing references total 1,897. These are occurrences, not counts of distinct colours or independent defects.

## Verification

- `python3 scripts/audit_ui_styles.py`: passes. The new UI style workflow runs this gate on CSS/audit changes. It rejects component palette/corner literals outside `theme.css` while allowing circles, zero corners and semantic references.
- `tests/browser/ui_consistency.mjs`: 48 loaded route/theme/viewport cases (12 workspace routes at 1280px/390px, light/dark), plus four goal-form states and capture dialogs at both widths/themes. Real APIs/SQLite, a synthetic PDF, notebook/note, six days of pulse/weight readings and a saved/logged goal are used. Checks cover normal target heights, phone field text, solid-surface control contrast, secondary family equality, hover/focus/disabled behavior, equal capture tiles, dialog bounds, focus restoration, horizontal overflow and page errors. [browser-audit.json](browser-audit.json) contains the per-case summary.
- The sweep waits for actual widget contents and the original report image. An early timing gap that could inspect empty page shells was found and corrected; only the loaded, populated pass supplies the committed evidence.
- `tests/browser/style_sweep.mjs`: passes primary-family checks across workspace, auth and onboarding at desktop/phone widths in both themes, plus dialog/backdrop timing, keyboard opening and reduced motion. The test compares disabled onboarding actions against the disabled reference and resets its viewport/theme without racing setup navigation.
- `node --test tests/test_notebook_items.cjs`: seven tests pass, including 4,096 custom-background contrast cases.
- Related document/report/date/chat-attachment Python regression run: 42 tests and five subtests pass. No backend implementation was changed by this audit.

The screenshots include loaded reports, both capture layouts, a populated phone Trends view and the goal form. They contain synthetic fixture records only. Larger full-page Home/Trends captures and full computed-style data were also inspected during the run; the committed selection keeps the evidence focused.

## Scope and deliberate exceptions

Data-selected notebook/calendar colours remain data. Fixed paper, rail, media, chart, cycle and status palettes remain separate semantic roles in the catalogue. Avatar circles and original-document geometry remain intact. Visually hidden form helpers and native checkbox/radio boxes are not ordinary visible button rectangles. The shader rail needs visual contrast inspection: a solid-background CSS calculation cannot represent its pixels. Native picker internals, live camera frames and vendor-owned rendering are not certified by this sweep. The baseline is merged `main`; unrelated uncommitted demo/runtime work in the original checkout was preserved.

## Reproduction

Start the app from this checkout with a fresh temporary `STELLIS_DATA_DIR`, `STELLIS_AUTH_MODE=required` and `PYTHONPATH=src`. Run `node tests/browser/ui_consistency.mjs` with `STELLIS_TEST_ORIGIN` pointing at that server, `STELLIS_PLAYWRIGHT_MODULE` at an installed Playwright module and `STELLIS_BROWSER` at Chrome/Chromium. The test creates its own synthetic account and fixtures. `STELLIS_UI_EVIDENCE` optionally records screenshots and full computed styles. Existing isolated fixtures can be supplied with `STELLIS_UI_STORAGE` and `STELLIS_UI_ROUTES`.

Run `tests/browser/style_sweep.mjs` against a separate fresh data directory because it exercises first-run setup and deletes its fixture account. No inference credentials or microphone/camera capture are needed for these style checks.
