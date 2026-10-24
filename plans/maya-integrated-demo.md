# Integrated Maya demo and Dash measurements (#185)

This supersedes the separate-interface direction in #183. Owner clarification: the demo and Dash/Mantine belong inside the actual interface. Preserve the real shell, sources, notebooks, recording, care and account/demo persistence.

## Implementation before filming

1. Mount a native FastAPI Dash measurement component under `/components/measurements/`. Load only its measurement body inside the existing Trends view, without a second sidebar. A same-origin component frame contains Mantine/Plotly styles and runtime; the existing native shell remains visible and owns navigation/capture. Use HTTP callbacks, existing `/api/v1/readings`, native manual-entry and camera controls, shared theme and source links. No fixture-only reading store.
2. Keep authentication at the existing account gateway/session gate. Browser reads/writes use the same-origin API and demo cookie. Clear and workspace changes discard component state. Test authenticated access, ordinary/demo isolation, save/reload/chart/table consistency and navigation away/back.
3. Extend the existing Maya scene dock with three chapter anchors. Scene buttons open actual app routes and focus existing controls. Preserve the existing yearly ZIP/date/notebook workflow. Broaden scenes across records, period history, visit notes, treatment, pregnancy, care, measurements and live camera; explanation is supporting.
4. Verify desktop/phone and both themes, keyboard/table state, overlays, source navigation, live-camera permission/cleanup and no browser errors. Fix accepted UI issues in the real component.

The contained component frame is deliberate: Mantine and Plotly dynamically generate styles. Isolating their style policy avoids weakening the parent application’s CSP or overriding its existing controls. This is an app-owned route and real-data component, not the rejected separate prototype.

## Recording script (actual app, approximately eight minutes)

- **2022, first concern (0:00–2:33):** enter the isolated Maya demo from My Health; inspect the continuous timeline; import the real synthetic ZIP, confirm source dates and notebook filing. Open the original iron result and existing visit notes. Log actual period dates through the existing control.
- **2024–25, changing care (2:33–3:59):** bring in subsequent source packages using the same approval workflow; retain earlier notebooks. Inspect the IVF treatment record and notebook Brief, review an actual medicine log, show appointment status and pregnancy/birth milestones. One brief source explanation/inspection scene; no invented model reply.
- **2026, everyday follow-up (3:59–6:20):** retain source history and notes; inspect Blood Health course/Levels and practical goal/calendar controls. Open the integrated Dash/Mantine measurement chart, table icon, search/order and source link inside the same shell. Show phone/light layout separately if helpful.
- **Live test (6:20–7:32):** open the actual camera preparation controls within Measurements. Leave at least 45 seconds to pause and test. Start alone requests permission. Show actual no-device recovery on this host; never substitute simulated inference values. Keep viewer estimates separate from Maya’s fictional history.
- **Continuity (7:32–7:52):** return to the native timeline, revisit the first source and current notebook. End in the usable application with the three chapter anchors available.

Scenes use real browser actions and saved source artifacts labelled as such. The final recording may adjust pacing to actual source-import latency; captions/narration must follow the recorded actions. Deliver video, transcript, evidence and app entry point. Keep #183 artifacts as a clearly superseded prototype rather than presenting them as the actual app.
