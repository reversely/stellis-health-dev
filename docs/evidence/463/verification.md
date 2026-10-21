# Home daily brief (#463)

Reference: actual HTML screen 10 names Chief of Staff / Daily brief under Everywhere before the notebook groups and search. Home now places the brief and grouped agents first, with the actual default agent in Everywhere. The richer sidebar, avatars and notebook controls remain.

## Verified

- Fresh-account source-reviewed setup (stored source fixture) handed off to Home. Actual GN100 local inference synthesized two real open tasks and the notebook filing, with navigable source links. Reload during generation, successful output persistence, Refresh/Stop and preservation of the prior success passed.
- Initial output falsely equated unavailable calendar data with no scheduled events. Inputs/prompt now distinguish unknown coverage, with a narrow contradiction validator using the existing bounded retry. One follow-up run was rejected rather than published; the final live run passed and explicitly called the schedule unknown. This is not general semantic verification, and the final pass does not prove a repair was exercised.
- Initial browser assertion raced asynchronous Home loading; changed to waiting for the control. The failed test exposed a shutdown orphan: its task-owned process was terminated and server shutdown now cancels and awaits brief work.
- Final UI-only check uses the stored actual-model answer, not a simulated model: task and thread navigation, Everywhere grouping, failed-refresh preservation, desktop/phone and both themes passed. Final desktop dark and phone light inspected.
- Fourteen viewport/theme states: no overflow/overlap errors. Eight warnings identify two 18px checkbox glyphs in four narrow states; their enclosing clickable labels are 44x44. Genuine small notebook/tag/rail links were enlarged rather than hidden from the audit.
- Full suite: 360 Python tests, 25 subtests, one skip. JavaScript: 148 passed after group changes. Final focused: 21 passed after excerpt bounds and duplicate-start coverage.

## Limits

Calendar connection was absent in this live scenario; connected-event and partial-provider-failure inference are not claimed as live-verified. Snapshot totals and the twenty-item-per-group bound are explicit. This brief is user-triggered, not a scheduled notification. Tests use a fresh account on the existing GN100 runtime, not a fresh machine installation. Source Compare, recording filing, confirmed sending, native capture, cloud proof and the user-specific integration retry remain separate full-flow gaps.
