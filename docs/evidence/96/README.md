# Camera capture deadline

Camera capture has an independent deadline alongside the first-result watchdog. The deadline uses the existing final-result policy and releases the camera even if vitals events stop. Each attempt resets first-result state. Closing, failing and completing a capture clear both timers.

## Browser regression

`tests/browser/camera_capture.mjs` runs Chromium with a fake camera and replaces the local vitals module with controlled events. The test accelerates deadlines and the successful capture clock. At 390 and 1280 pixels it checks:

- One event followed by silence reaches a failure and ends every media track.
- A retry without a first event reaches the startup failure.
- Closing an active retry clears timers and ends every media track.
- A successful reading remains visible after the deadline would have expired.
- Measuring again after success resets the startup watchdog.

The test reports no browser exceptions. It checks lifecycle behaviour with synthetic input. Real camera measurement accuracy remains a separate acceptance requirement.

Run against an isolated local workspace:

```sh
STELLIS_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
STELLIS_BROWSER=/path/to/chromium \
STELLIS_TEST_ORIGIN=http://127.0.0.1:8779 \
node tests/browser/camera_capture.mjs
```

The browser tooling comes from the layout-audit environment. The product dependency list stays unchanged.

## Layout and execution

The layout-audit script opens the deadline failure with a fake camera at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes. The modal audit excludes the inert background behind the native dialog. Both final reports contain zero failures and zero warnings. Local reports are `/tmp/stellis-review-camera-light/report.md` and `/tmp/stellis-review-camera-dark/report.md`.

All 191 JavaScript tests pass, including 25 Trends and capture helper tests. The deadline adds one timer per active attempt and no provider calls or downloads.
