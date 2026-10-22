# Camera reading group

Request and acceptance: [ticket #107](https://github.com/reversely/stellis-health-dev/issues/107)

## Behaviour

Home and Trends group pulse, breathing rate and heart rate variability under Vital signs. Each group has one inverted Log vital signs camera action. The existing capture computes and saves available readings from one recording. Trends retains quieter Log manually controls for separate entries.

Camera-based goals and the dialog heading use Log vital signs. The stored goal activity remains pulse so existing goals and completion history remain available. Pulse measurements still determine completion of that goal.

## Verification

Status: implemented and locally verified

- Node: 34 tests pass across goal UI, trend helpers, camera capture state and vital-sign formulas
- Python: 22 tests and 23 subtests pass across goals and readings
- Grouping browser regression: Home and Trends keep all camera measures together with one camera action before readings exist, with pulse alone and with all three readings saved; phone and desktop, both themes
- Capture browser regression: stalled events, silent retries and closing release the camera; successful results survive their deadline
- Group save: a controlled camera reader and derived values save all three readings through the real API; Trends refreshes and Home shows the values after navigation
- Layout audit: empty and populated Home and Trends groups pass at 360, 390, 768, 1024, 1280 and 1920 pixels in both themes
- Audit exclusions: decorative rail canvas and intentionally visually hidden controls
- Security: grouping uses DOM text helpers; camera processing and media handling retain their existing on-device path
- Loading: no additional dependency, model, capture or background loop

The browser capture fixture controls the reader and derived values to exercise persistence and UI updates. Formula tests exercise the numeric calculations separately. This work does not validate accuracy against a physical device.

Local audit reports:
- /tmp/stellis-vitals-audit-light/report.md
- /tmp/stellis-vitals-audit-dark/report.md
- /tmp/stellis-vitals-filled-light/report.md
- /tmp/stellis-vitals-filled-dark/report.md

Regression commands:

```sh
node --test tests/test_goals_ui.cjs tests/test_trends.cjs tests/test_vitals_math.cjs
uv run --locked --with pytest python -m pytest -q tests/test_goals.py tests/test_readings.py
STELLIS_TEST_ORIGIN=<isolated-app-origin> STELLIS_BROWSER=<chromium-path> STELLIS_PLAYWRIGHT_MODULE=<playwright-module> node tests/browser/camera_grouping.mjs
STELLIS_TEST_ORIGIN=<isolated-app-origin> STELLIS_BROWSER=<chromium-path> STELLIS_PLAYWRIGHT_MODULE=<playwright-module> node tests/browser/camera_capture.mjs
```
