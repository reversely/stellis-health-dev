# Call recovery and tour verification

Issues: [Thinking recovery #118](https://github.com/reversely/stellis-health-dev/issues/118), [owner-filed call and tour bugs #120](https://github.com/reversely/stellis-health-dev/issues/120).

## Owner reference

The owner clarified that the stalled onboarding call showed Thinking. The [attached tour screenshot](https://github.com/user-attachments/assets/fd6f83d6-ee3d-499e-aaae-ba43a76c65c7) shows Step 7 of 7 with earlier narration still visible over the home page and a white call panel against the light page. The implementation associates each stage with a visible title and narration, paces Next, and gives the panel a tinted surface with separate content.

## Automated verification

The full Python suite passed 539 tests with four skips and 119 subtests. All 197 JavaScript tests passed. The skips include the optional real-model voice integration test. The synthetic fixture substitutes recognition, synthesis and model output while retaining the real authenticated routes, socket transport, persistence and browser interface.

Regressions cover `[DONE]` on a connection that stays open, pending end-call tools, Thinking timeout and retry, retained answers, voice failure, bounded queued answers, controls during recognition, delayed interruption checks, literal text rendering, concurrent completion saving one note, public narration caching and invalidation, corrupt cache repair, and origin rejection for text-only sockets. Transport tests verify that queued audio drains before one completion event, that late interruptions cannot cancel completion, and that Listening waits for playback.

## Browser workflows

`tests/browser/onboarding_recovery.mjs` verifies unclear speech, Done speaking, a subsequent accepted spoken answer, voice failure, stopped microphone capture, typed recovery, Thinking timeout, retry without another person turn, and natural completion with Add records. It runs at 390 and 1280 pixels in both themes.

`tests/browser/voice_bundle.mjs` verifies the visible Daily check-in entry, check-in and general-call completion, saved end state, all seven narrated tour stages and targets, Finish tour, the My Health action, question-only language-model inference, and reuse of cached opening audio. It also checks that visible popup controls remain inside the viewport. It runs at 390 and 1280 pixels in both themes.

## Layout verification

The layout audit covers 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes. States include listening, active detection, retry, voice failure, the compact onboarding panel, tour narration, check-in completion and My Health. Final reports and screenshots remain in the worktree:

- `.agents/catalogue-runtime/recovery/onboarding-light/report.md`
- `.agents/catalogue-runtime/recovery/onboarding-dark/report.md`
- `.agents/catalogue-runtime/recovery/calls-light/report.md`
- `.agents/catalogue-runtime/recovery/calls-dark/report.md`
- `.agents/catalogue-runtime/recovery/home-light/report.md`
- `.agents/catalogue-runtime/recovery/home-dark/report.md`

Popup audits exclude the page behind the floating call. Onboarding audits include the notes and compact call together. Decorative rail canvases are excluded. The checks include horizontal overflow, clipped text, overlap, target size and fixed popup control visibility. Screenshots were reviewed across widths and themes.

## Execution limits

Reply segments have a 20-second deadline and replies a 90-second total limit. Recognition and synthesis have 15-second deadlines. The synthetic Thinking fixture uses a 0.5-second segment deadline to verify recovery without a long wait; its elapsed-time log records approximately 0.501 seconds. Unit checks use short native-operation delays to verify control responsiveness. These measurements do not predict hosted inference latency.

Tour navigation makes zero language-model calls. One question makes one model call in the fixture. Reopening the same tour narration adds zero synthesis calls after the cache has been populated. A cold cache still needs synthesis through the configured backend.

## Reproduction

Run the disposable loopback fixture:

```sh
PYTHONPATH=src uv run --locked python tests/fixtures/call_recovery_server.py
```

The fixture creates a temporary data directory and listens on port 8784. The browser scripts use `STELLIS_TEST_USERNAME=recovery-review` and `STELLIS_TEST_PASSWORD=isolated-recovery-review-password`. Set `STELLIS_PLAYWRIGHT_MODULE` and `STELLIS_BROWSER` for the local Playwright and Chromium installations. This server is a test fixture with synthetic responses, not an application deployment.
