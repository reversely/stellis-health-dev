# Joined logging

Issue: [#154](https://github.com/reversely/stellis-health-dev/issues/154). Date: 2026-10-24. Design: [ADR 0086](../../decisions/0086-tracker-registry-and-joined-logging.md). Reference for the review list: [scene 3b](../../refs/stellis-demo/scene-3b-call-panel.png).

## Change

- `tracker_log.py` and `GET /trackers/log/items`, `POST /trackers/entries` and `DELETE /trackers/entries/{id}`. Goals, readings and observations accept a shared connection, so one batch is one transaction.
- `tracker-log.js`: the choose step (tiles by area, live count, search after twelve items, a ten-item cap) and the review step (one shared date with Today, Yesterday or a date and optional time; one row per item with its control; inline per-row errors). Proposal mode shows evidence, has checkboxes and saves only through *Log selected*. A toast offers Undo.
- Entry points: Add (*Log Items*, now first of seven choices) and Tracking (*Log*).
- Contrast: in dark mode, dialogs are light glass, so their blocks and primary actions now use a dark fill with light ink, not white on white. The block probe in `ui_consistency.mjs` now also checks inside a dialog.
- Added the Tabler `pill` icon used by medicine courses.

## Evidence

- `tests/test_tracker_log.py` (12 tests): items and gates, ended courses, all four kinds in one batch with exact undo, rollback on one failing entry, undo that keeps entries changed since, restoring a replaced outcome, limits, yesterday against the schedule, and per-entry route errors. The full suite passes: 677 passed, 2 skipped.
- `tests/browser/tracker_log.mjs`: tiles by area, search, the ten-item cap, keyboard selection, review, default choices, all-or-nothing rollback with a row error, yesterday, save and undo through the toast, proposal evidence and *Log selected*, the Add entry point, and sheet bounds and footer visibility at 1280 and 390 px in both themes.
- Also pass: `tracker_courses`, `reproductive`, `daily_log`, `ui_consistency` (50 checks) and `style_sweep`. `health_capture.mjs` and `ui_consistency.mjs` were updated for the seventh Add choice.
- `health_capture.mjs` times out on unchanged `origin/main` as well: its appointment on 2027-01-02 is outside the current month shown in My Health's Upcoming. That failure predates this change.

Screenshots use synthetic records; the long tile names come from the test's run-specific names.
