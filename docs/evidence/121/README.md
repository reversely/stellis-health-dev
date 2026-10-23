# Unified My Health dashboard

Request: [owner ticket #121](https://github.com/reversely/stellis-health-dev/issues/121)

The default dashboard shows Health Overview, Upcoming, My Notebooks, Measurements and Health History in that order. Overview spans the desktop width; Upcoming and My Notebooks share a row. Phones retain the same order in one column.

## Data and behaviour

- Overview shows a cited summary preview and accepted condition, medication and allergy facts with original source links. Active care contains only notebooks the person selects; the dashboard does not infer a condition or invent a progression stage.
- Upcoming combines the next three connected-calendar appointments, dated records and saved plans. Scheduled, Dated record and Planned remain separate labels. View all expands the available schedule. A future date alone never implies a booked appointment.
- My Notebooks shows up to three selected notebooks with their actual collection and a recent source title or saved description. View all opens the full notebook list.
- Measurements shows up to three selected metrics with latest values, dates and sparklines. Metric and Log links open the relevant existing chart or entry form. One Log vital signs button retains grouped camera capture.
- Health History shows up to five recent timeline entries and their original sources. Timeline and Records link to the complete existing views, which also link to each other.

Customize dashboard saves account-local notebook, measurement and active-care choices. The API validates availability, duplicates and the three-item limit. Archived notebooks disappear from selections without deleting their contents. Goals and library retains existing search, review, capture and management controls in a supporting disclosure. Recording, recovery, transcription setup, reminders and incoming check-in calls remain outside that disclosure.

Calendar loading runs separately from local data. A startup check also found that the initial route could use a deferred module before it finished loading; routing now waits for module readiness.

## Verification

- Four Python tests cover persisted selections, empty choices, rejected values and archived notebooks
- Thirty Node tests cover dashboard ordering/provenance helpers, goals and Trends
- `tests/browser/health_dashboard.mjs` covers empty and populated states, literal text rendering, source citations, calendar status, a real future-dated record, notebook collections, persisted choices, selection limits, chart/log deep links and six widths in both themes
- The browser regression deliberately delays the Trends script to check startup ordering
- `tests/browser/camera_grouping.mjs` passes empty, partial and complete readings on My Health and Trends at phone and desktop widths in both themes
- `tests/browser/style_sweep.mjs` passes shared controls, hover/disabled states, onboarding and pointer/keyboard/reduced-motion dialog checks
- Authenticated calls pass greeting, query parameters, connection loss and retry at all six widths in both themes after rebasing onto the shared call-completion changes; the shared disconnected status retains the requested apology
- Layout audit covers My Health, Timeline, Records, a logging form and a notebook at 360, 390, 768, 1024, 1280 and 1920px in both themes; final results have no layout failures or warnings

The browser uses a separate local account with real notebook, document, reading and preference writes. Calendar, accepted-fact and summary responses use explicit fixtures to check presentation and citation links without a provider request. Real calendar authorization and clinical extraction quality are outside this check. No source content is copied into a new clinical store.

Local layout reports: `/tmp/stellis-dashboard-audit-{light,dark}/report.md`, with the final My Health checks in `/tmp/stellis-dashboard-delivery-{light,dark}/report.md`. The only initial console resource warning is a missing-resource 404; the final browser regression reports no application page errors.
