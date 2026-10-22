# Call connection recovery

## Request

> on the call interface, when I attempt to click any Call Stellis item, the call is dropped: "The call dropped" with no other options. Please investigate what's causing this and insert a brief apology into the copy as in Sorry, we couldn't reach the agent etc

## Findings

The account gateway accepted only the intake WebSocket route. It rejected coach and tour connections before the call started. Its upstream URL also omitted query parameters. Coach calls need those parameters to initialize their kind and local date.

The gateway now relays all three explicit call routes with their query parameters. Session and same-origin checks still apply. Both call interfaces use “Sorry we couldn't reach the agent”. The docked panel expands after termination and focuses Call again. Retry preserves the original call kind.

## Verification

Status: verified locally through the authenticated account gateway

- Current main and the deployed gateway allowed only /api/v1/intake/call before this change
- The deployed app.js matched current main and included the speech setup fix
- Targeted Python suite: 28 tests and three route subtests passed across account gateway, coach call, tour and model setup tests
- Real gateway subprocess checks: ordinary calls, morning check-ins and tours reach ready and their opening messages
- Gateway security checks: missing sessions and foreign origins fail for each added call route
- Real browser gateway checks: Call Stellis reaches its opening greeting and sends the call kind, local date, time and UTC offset
- Forced connection loss expands a minimized panel and exposes the apology, Call again and Close
- Retry opens a new connection and reaches the greeting again
- Browser and panel layout checks pass at 360, 390, 768, 1024, 1280 and 1920 pixels in both themes
- Browser page errors: none
- Panel layout audit excludes the background workspace and decorative canvas

Regression: tests/browser/coach_call.mjs uses an isolated authenticated account gateway and removes its test account. The local fixture has no voice models and exercises the text fallback. Live microphone recognition, generated audio and provider replies remain unverified. The deployed route allowlist must be checked again after deploying the merged fix.

Local panel audit reports: /tmp/stellis-call-panel-{theme}-{width}.json with a screenshot beside each report. The browser test accepts STELLIS_LAYOUT_AUDIT_MODULE for the layout-audit skill's exported page check.

Follow-up request and deployment evidence: [ticket #112](https://github.com/reversely/stellis-health-dev/issues/112)
