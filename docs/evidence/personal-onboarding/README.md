# Personal onboarding and cycle integration

## Requests

> Goals, plural. Another item; medicines, etc may not be easily recognizable. Please provide category suggestions + UI for searching from a library

> "let's talk about your health goals," NOT "your goal, your health and"...like what even was that

> The onboarding flow is missing basic personalization; First, what should I call you? (a typeform-style field should slide up fluidly); if the person says the reponse, the response types in for the user and the user can correct it (is that right?) then, gender, do you have a period, when is your birth date, then do you have preexisting health conditions, what would you like to navigate, are you interested in nutrition, general wellness or any other fields (multi select for all non illness related); if women, are you interested in cycle tracking; ok, you're all set! i've taken the opportunity to set up a few wellness notebooks for you; let me know if these sound like what you're interested in tracking, and feel free to adjust these at any tiem. etc.

> main has structural cycle tracking updates; fold in but dont make it weird

The person also requested a spoken reason, goodbye and next action before natural call completion. A clarification question must not count as a completed intake topic.

## Behavior

Implemented: one editable question at a time, optional speech, explicit confirmation, plural goals, a local searchable medicine-name library and multiple wellness interests. Notebook review precedes creation. Natural call completion drains queued speech. Free intake uses explicit topic completion with a bounded safety budget rather than counting three replies.

The cycle and calendar source came from the existing local main checkout. Onboarding uses its account-local `health_preferences` table and reproductive routes. Gender leaves the period preference unspecified. Confirmed Yes and No map to the shared boolean; Not currently, a skipped answer and Prefer not to say leave it unspecified. Cycle interest suggests a reviewable notebook. Logging dates remains an explicit tracker action. The existing calendar combines appointments, record dates, plans and enabled tracking sources.

## Verification

- Automated Python checks cover profile confirmation, correction, date validation, conditional cycle interest, shared preference writes, notebook recommendations, free intake completion, recovery, authentication and account isolation.
- Tracker and unified-calendar backend tests cover period history, overlap rejection, doses, device records, date projection and appointment retention when period tracking is disabled.
- `tests/browser/onboarding_personalize.mjs` uses a synthetic spoken name through real Moonshine recognition and Chatterbox synthesis. It checks editing before save, medicine search, multiple goals, interests, shared preference, zero invented cycle entries, notebook review and persistence. The fake microphone does not establish physical microphone quality.
- `tests/browser/reproductive.mjs` checks logging, pack presets, doses, undo, reload, device removal and keyboard controls.
- `tests/browser/calendar_views.mjs` checks one calendar, overlapping tracks, date selection and keyboard navigation.
- Profile name, medicine results and multiple interests passed layout audit at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in light and dark themes with zero failures and warnings. Reports: `/tmp/stellis-profile-audit-{name,library,interests}-{light,dark}/report.md`; name dark used `/tmp/stellis-profile-audit-name/report.md`.
- A local medicine query measured 12.3 ms on first load and 3.3 ms warm on this machine; responses cap at 20 names. The browser debounces typing by 180 ms.

Validation uses port 8842 and disposable accounts. The installed app uses port 8840 and the existing Chatterbox service on 8841. Both app and synthesis bind to loopback. See [runtime wiring](../../chatterbox-local-runtime.md).
