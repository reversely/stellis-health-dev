# Source filing Undo (#461)

Actual reference: HTML screens 3 and 4 show completed filing activity with Undo. Screen 4 Compare is a distinct source comparison request and remains separate. The shipped row uses real source records and existing notebook styling, without the illustrative project names.

## Verified

- Full suite: 355 Python tests, 25 subtests, 1 skip; 148 JavaScript tests. Final focused rerun: 10 tests after adding exact legacy source-marker matching and its regression case.
- Browser: fresh-account setup with a stored reviewed-source fixture, completion, actual notebook filing activity, source disclosure/link, Undo, preservation of a subsequent content edit, reload and repeat API Undo. No browser errors. No external source write or inference is involved in reversal.
- Fourteen viewport/theme geometry states, zero findings. Desktop dark and phone light filing screenshots visually inspected, plus desktop post-Undo screenshot. Source appears in No notebook after Undo and the original notebook count becomes zero.
- Backend tests: edits preserved, moved/deleted objects untouched, wrong-notebook access rejected, repeated Undo returns original result, setup retry does not refile, failed import rolls back all pages and filing history, and legacy imports are not falsely attributed or matched by ID prefixes.

## Limits

Source review uses a stored fixture rather than a fresh Google scan. New onboarding imports get history; old unrecorded imports are not retroactively invented. Recording filing and source Compare remain separate full-flow gaps, alongside confirmed sending, daily brief, native capture and cloud proof. This is not whole-wireframe completion.
