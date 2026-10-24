# Notebook Brief

Issue: [#157](https://github.com/reversely/stellis-health-dev/issues/157). Date: 2026-10-24. Reference: [scene 4](../../refs/stellis-demo/scene-4-course-and-levels.png).

## Change

- `GET /notebooks/{id}/brief` (`notebook_brief.py`): the day strip, the notebook's courses, pending items and Levels, from records. Reference intervals and lab flags are parsed from each fact's quoted line. Medicine courses gain an optional supply unit, so details read "45 tablets per fill".
- Above the tabs: **Timeline** (15 capsules; logged doses solid, expected pale, today outlined and its weekday in an inverted circle), a **course band** (name and dose, schedule and start, doses logged and weeks, and a track with today, calculated and end markers), and **Coming up** (date or month, a dot, title, detail, source link and a status block).
- Brief tab: **Levels** (a card per measure with its latest value, unit, status block and trend line; a range switch from the data's years or the past year), a chart (shaded out-of-range band, gridlines, line broken across gaps of more than a year, hollow points from other notebooks, treatment bands, an inverted tooltip, arrow-key navigation) and a side list (Latest, Previous, Flagged low or high by the lab, Selected with its source). Non-level facts follow.

## Evidence

- `tests/test_notebook_brief.py` (10 tests): interval and flag parsing, including a reversed range and a date before the value; status preferring the lab flag; levels grouping across name case and µ/u units with points from another notebook; coming-up order, details and month precision; strip states; notebook readings as levels; an unknown notebook. The full suite passes: 692 passed, 2 skipped.
- `tests/browser/notebook_brief.mjs` on `tests/browser/notebook_brief_server.py`, which seeds a notebook with six ferritin results (two in a Pregnancy notebook), a course with 32 logged doses and a planned visit. It checks the strip, the band (32 doses, 9 weeks), coming-up rows and source, cards and status blocks, the range switch, point and hollow counts, the legend, the treatment band, the side list, keyboard selection and the past-year filter, at 1280 and 390 px in both themes without overflow. `ui_consistency` passes.
- `health_capture.mjs` now looks for the notebook weight reading as a Levels card. Its earlier appointment-date failure on `origin/main` is unrelated.

Screenshots use synthetic records with dates relative to the test day.

## Follow-up UI correction

Owner feedback on `timeline-1280-light.png`: align with the style guide and demo, avoid overlapping icons, clashes and hardcoded content. See [the correction evidence](layout-correction/README.md) for the revised layout, actual browser checks, references and limits. The original screenshots are retained for comparison.
