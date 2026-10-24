# Pregnancy with a pending-only timeline

Issue: [#158](https://github.com/reversely/stellis-health-dev/issues/158). Date: 2026-10-24. Reference: [pregnancy timeline](../../refs/stellis-demo/pregnancy-timeline.png).

## Change

- A **pregnancy** kind in the tracker registry: dating basis, date, embryo age or scan age, an optional booked birth date and links. Derived: start, due date, weeks and days, trimester, and the basis in words. The reference's day-5 transfer on 15 November 2024 gives a start of 27 October 2024 and a due date of 3 August 2025, as shown there.
- Notebook Brief: event dots on the strip (planned or scheduled hollow, due date filled), a *weeks, days* caption, a band with weeks, trimester, due date and a start-to-due (or booked) track, *Coming up* with a *Due* status block and the dating source, and a **Birth date** card. A booked date ends the timeline there and keeps the due date.
- The Tracking panel shows a pregnancy card; the calendar has a Pregnancy track.
- Phone fixes found by the existing daily-log test: tracker tabs wrap now that more kinds exist, and a Brief rendered twice by overlapping calls keeps only the latest.

## Evidence

- `tests/test_trackers.py`: dating for each basis, including across a leap day; weeks, trimester and booked birth; validation. `tests/test_notebook_brief.py`: pending items, strip event marks, the booked-birth cut-off, and a finished pregnancy leaving the Brief. The full suite passes: 705 passed, 2 skipped.
- `tests/browser/pregnancy_brief.mjs` (dates relative to the test day, so today is always 38 weeks and 5 days) covers the caption, event dots, band, coming-up rows and source, setting and clearing a booked birth, a dark phone layout without overflow, and the Tracking card. `tracker_courses`, `tracker_log`, `reproductive`, `daily_log`, `calendar_views` and `health_preferences` pass. `tracker_courses` now expects Medicines and Pregnancy tabs when period tracking is off.

## Limits

The reference's *Discussed* range ("Jul 27 to Aug 3, Induction options") needs care events with a discussed status and an end date, which the care event schema does not have yet. Items with a planned or scheduled status work as shown. The prototype's date switch is not built; the Maya demo uses its own story date.
