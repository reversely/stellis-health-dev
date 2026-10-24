# Tracker registry and medicine courses

Issue: [#153](https://github.com/reversely/stellis-health-dev/issues/153). Date: 2026-10-24. Design: [ADR 0086](../../decisions/0086-tracker-registry-and-joined-logging.md). Reference: [scene 4](../../refs/stellis-demo/scene-4-course-and-levels.png).

## Change

- `trackers.py` registers period, pill pack, device and medicine course on the existing tables, with forward-only columns for notebook, source and amount. `reproductive.py` delegates to it, so `/reproductive/*` and the existing tracker views are unchanged.
- Medicine courses: dose and unit, four schedule types, start and end, supply per fill, units per dose and repeats. Each fill's run-out is calculated, and skipped doses extend it. An end date adds a planned last dose.
- `/trackers/kinds`, `/trackers`, `/trackers/{kind}`, `/trackers/records/{id}` and `/trackers/records/{id}/outcomes/{day}`.
- My Health's section is now **Tracking**. Tabs come from the registry; the cycle kinds keep their period-preference gate, so medicines show for everyone. A course card shows the dose and schedule, today's state (*Due today*, *Not a dose day. Next dose …*), Mark taken, Skip and Undo, doses logged and duration, a start-to-end track with calculated markers, *Coming up* rows with *Calculated* and *Planned* status blocks, and a link to the source record.

## Evidence

- `tests/test_trackers.py` (23 tests): every-other-day run-out (45 tablets from June 19 runs out September 15, matching the reference), skipped doses, each schedule rule, as-needed logging, summaries, end dates, edits keeping outcomes, validation, links and deleted sources, legacy table migration, calendar projection and the routes. The full Python suite passes: 665 passed, 2 skipped.
- `tests/browser/tracker_courses.mjs`: schema form with a conditional field and weekday choices, validation shown in the form, card state, log, focus after logging, undo, the calendar feed, and no overflow at 1280 and 390 px in both themes.
- Existing browser tests pass: `reproductive`, `daily_log`, `calendar_views`, `health_preferences`, `health_dashboard` and `ui_consistency`. Three were updated because the section is now visible without the period preference: they assert that no cycle tabs appear instead of a hidden section, and wait for the calendar rather than for the section.

Screenshots use synthetic records. Light mode shows the dark amber *Calculated* block with light text; dark mode flips to a pale block with dark text.

## Limits

Joined logging of several items is #154. Period, pill and device forms keep their hand-built forms; they can move to the schema renderer later.
