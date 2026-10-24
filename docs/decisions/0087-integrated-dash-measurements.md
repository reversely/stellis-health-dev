# ADR 0087: Dash measurements inside the existing application

Date: 2026-10-24. Status: accepted for the first component. Ticket: #185.

The owner clarified that Dash/Mantine and Maya’s demo belong in the actual interface. The standalone #183 shell and browser-only story are superseded, not the production migration target.

Mount a measurement body under `/components/measurements/` in the existing account-local FastAPI process. The native Trends view contains this same-origin body frame and keeps its existing sidebar, header, mobile navigation, capture controls and SPA routes. Mantine renders shared cards, category/range controls and tables; Plotly renders charts. There is no second app shell or fixture-only reading service.

The frame isolates Mantine/Plotly’s generated styles. Its CSP permits inline styles and same-origin framing only for this component; the parent keeps its script/style policy and cannot be framed. Both sides check message origin and window identity. The parent supplies actual `/api/v1/readings` projections, theme and demo state; all persistence uses existing native services and forms. Native source routes are allowlisted before navigation. Dash callbacks compute presentation from their request data and keep no account-global clinical store.

HTTP assets/layout/callbacks pass the existing login gate and gateway to the account process. The Dash runtime socket has explicit same-origin/account checks and a narrowly added gateway relay path. Dash 4.4.1 opens this runtime socket even when callbacks use HTTP. Its backend also attempts a global catch-all at ASGI startup: this installation disables that instance method because the component already has an explicit prefixed index and the native application owns other paths. Versions are pinned; authentication, transport and native 404 regression checks must pass before upgrades.

The existing Maya workspace, database, generation lock, source files and Clear action remain authoritative. The chapter dock opens real source/notebook/measurement routes. Demo camera estimates are kept separately in the browser, never compared with fictional Maya readings; ordinary camera capture retains native readings API persistence. Original #183 artifacts remain as historical evidence and are explicitly labelled superseded.

This decision covers Measurements and the demo journey. Rich-text editing, recording, original documents, care, calendar and chat keep their existing native implementations. Additional Mantine migrations should reuse their real services and be validated individually rather than replacing the interface with another fixture app.
