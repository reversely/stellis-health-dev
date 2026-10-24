# Check-in agenda, snooze and confirmed entries

Issue: [#156](https://github.com/reversely/stellis-health-dev/issues/156). Date: 2026-10-24. References: [scene 3a](../../refs/stellis-demo/scene-3a-check-in-card.png), [scene 3b](../../refs/stellis-demo/scene-3b-call-panel.png).

## Change

- **Agenda** (`coach_call.agenda`): calculated course dates, doses due, unbooked planned care and goal progress, from records. It appears on the incoming card, in the opening sentence and as the call's checklist.
- **Snooze:** *In 30 minutes* (the length comes from `GET /coach`) stores a time, after which the call rings again.
- **Confirmed entries:** `log_goal` became `log_entry`, which proposes an item and a date resolved on the server (today, yesterday, or a date up to seven days back). `topic_done` marks topics covered. The panel shows the model's choice and the person's words, then the inline review; only *Log selected* saves.
- **Contrast:** the person's bubble uses the block roles; the bubble style no longer leaks into nested review text.

## Evidence

- `tests/test_coach_call.py`: snooze timing, including a snooze past midnight; the agenda order and labels from a course, a planned visit and a goal; the opening sentence; date resolution (yesterday, today, an ISO date; rejecting tomorrow, future and older dates and other words); a proposal that logs nothing until confirmed, a covered topic, and history with both tool results; invalid tool calls doing nothing. The full suite passes: 682 passed, 2 skipped.
- `tests/browser/coach_checkin.mjs` on `tests/browser/coach_checkin_server.py`, which replaces only model replies with a script that reads the real call context. It covers the card's ring time and three agenda rows with labels, snooze and its API effect, the dark phone panel with the source note and *0 of 3*, sending the walk message, the model choice line, *1 of 3*, *Confirm for …* with Yesterday pressed, nothing logged before confirmation, *Log selected* logging yesterday's walk, and no overflow.

Screenshots use synthetic records. The model in these screenshots is the fixture script; real model wording will differ.
