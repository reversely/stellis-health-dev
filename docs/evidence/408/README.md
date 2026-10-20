# Settings inference and trace verification — issue 408

The owner requested agent traces and model routing in Settings, then explicitly included local model switching. Cloud execution remains on Nebius Cloud with Token Factory; explicit local execution remains GN100 with Ollama. No Tailscale reconnect or restart was used for this implementation. Commands reused the existing GN100 SSH session.

## Verified

- Real `stellis-local` sandbox on gateway 8990: switched Nemotron Nano to installed Qwen 3.5 9B, completed a source-cited agent reply, recorded token usage, interrupted a request, and recorded an actual unavailable-model failure. Restored Nemotron Nano in a finally block. See `real-runtime.json`.
- Browser: populated and expanded traces, refresh preserving expansion, clear history, installed model choices, unchanged selection disabled, alternate selection enabled, invalid selection rejected. See `browser.json` and four `settings-*` screenshots.
- Desktop 1440 and phone 390, light and dark: no page errors or horizontal overflow. Screenshots inspected visually.
- Layout audit: 360, 390, 768, 1024, 1280, 1440 and 1920, zero failures. Existing back-link tap target is 20px high on phones; retained outside this feature. The two console 404s per page are the existing `/api/v1/account` requests in the isolated open-auth test server, not inference errors. Reports are in `audit-light` and `audit-dark`.
- Cloud configuration and an actually unreachable local inference endpoint are checked separately; no cloud deployment or cloud inference success is claimed. See `states.json`.
- Final suites: 300 Python tests passed, 1 skipped, 25 subtests; 159 JavaScript tests passed. No provider stand-ins were added.

## Limits

Traces are execution metadata, not model reasoning or a complete external tool audit. Transcript entries describe individual inference requests; final task validation remains in the existing task records. Cloud model identity and token counts appear only if the remote response reports them. Model switching is owner-only and guarded within the account worker process, matching the current one-worker-per-account deployment. The model picker does not download models.

The original `stellis.service` on port 8765 and its gateway on port 8080 are outside this change. Cloud provisioning remains tracked in issue 406.
