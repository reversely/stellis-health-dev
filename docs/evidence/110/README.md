# Speech setup progress

Request and acceptance: [ticket #110](https://github.com/reversely/stellis-health-dev/issues/110)

## Findings

The CLI starts the model installer in the shared gateway process. Setup requests previously reached the account process, whose independent installer state could remain idle. The browser treated idle as an active download at zero percent. Responses without Content-Length also left progress at zero despite receiving bytes.

A read-only check of the hosted server found all three transcription model files under /data/models. The server's model status reported ready with no missing files. The displayed zero percentage therefore cannot establish that the hosted model download stalled. The user's browser origin was not supplied.

## Changes

Authenticated setup requests use the shared gateway process. POST /api/v1/setup starts or retries installation through the existing single-thread guard.

The installer reports connecting, receiving and verification stages with actual byte counts. The browser measures the current file's progress from its received and total bytes. An unknown size uses an indeterminate bar. Idle offers Start setup; failure offers Try again; a status-fetch failure offers Check again. Ready hides the card. Destination creation errors now report failure instead of leaving a background thread marked as downloading.

## Verification

Status: implemented and locally verified

- Ten Python tests pass for installation, checksum rejection, byte tracking, destination errors, account routing and gateway behaviour
- Hosted setup tests reject missing sessions and cross-origin writes
- Browser checks pass at phone and desktop widths in both themes for idle, advancing progress, unknown size, verification, failure, retry, status-fetch recovery and completion
- Browser fixtures include an untrusted error string and verify that the product does not insert it as HTML
- Layout audits pass with zero failures and warnings at 360, 390, 768, 1024, 1280 and 1920 pixels in both themes for idle, receiving and failed states
- Audit exclusions: decorative rail canvas and intentionally visually hidden controls
- Download progress tests use controlled byte streams; browser checks use controlled setup responses
- No full model download or production restart was required for verification
- The implementation retains the existing polling interval and installer thread guard

Local audit reports: /tmp/stellis-speech-audit-light/report.md and /tmp/stellis-speech-audit-dark/report.md. Screenshots are beside each report.

Regression commands:

```sh
uv run --locked --with pytest python -m pytest -q tests/test_models.py tests/test_account_gateway.py
STELLIS_TEST_ORIGIN=<isolated-app-origin> STELLIS_BROWSER=<chromium-path> STELLIS_PLAYWRIGHT_MODULE=<playwright-module> node tests/browser/speech_setup.mjs
```
