# How Stellis answered

Issue: [#155](https://github.com/reversely/stellis-health-dev/issues/155). Date: 2026-10-24. Reference: [scene 2](../../refs/stellis-demo/scene-2-how-stellis-answered.png).

## Change

- Report explanations and direct notebook answers record a span with step events and store its ID on the saved answer. Agent answers link through their job.
- `answer_trace.py` combines the trace with the answer's own evidence. Related sources come ranked with quotes from saved evidence. Checks compare the page revision and related text digests with the current text, so a later edit shows as *Changed*. Citation counts come from validated citations.
- `GET /traces/{id}` and `GET /traces/job/{job_id}`.
- `answer-trace.js`: a right-hand panel (full height on phones) with tiles, timed steps with sublists of sources and checks (status blocks), Copy request ID, *All requests in Settings* and the short ID. Linked from report explanations, notebook answers and agent replies.

## Evidence

- `tests/test_report_context.py`: the explanation's trace has the expected step events, the selected and ranked related sources with the earlier value quoted, unchanged checks, 2 of 2 citations, *Changed* after a related report is edited, and 404 for an unknown trace. `tests/test_notebook_chat.py`: a direct answer's trace ID is stored and served with its question, steps and cited source. The full suite passes: 679 passed, 2 skipped.
- `tests/browser/report_context.mjs` now opens the panel at 1280 and 390 px and checks steps, the ranked quote, tiles, check status blocks, the Settings link, overflow and focus return. The new `tests/browser/answer_trace.mjs` covers a notebook answer in light desktop and dark phone layouts.
- Both browser tests use `tests/browser/report_context_server.py`, which replaces only model replies. Model and token tiles therefore read *configured* and *Token counts not reported*, and the model request and reply steps (recorded by the real gateway) are absent from these screenshots. With a real runtime they appear between source selection and the citation check.
