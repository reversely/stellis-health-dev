# Fresh local deployment verification (#471)

Verified on GN100 with a new /tmp/stellis-fresh-proof directory, gateway 8991,
control port 18891 and sandbox stellis-fresh-proof. Production uses different
ports, sandboxes and data directories. No Tailscale reconnection was performed.

The operator created a new sandbox using the pinned publisher image, selected
ollama-local / nemotron-3-nano:latest, and received an exact fresh nonce reply.
The host already had NemoClaw, Ollama and the model cache installed. This is
not evidence of installation on a wiped host or of driver/Docker installation.

A fresh account then used the actual newly provisioned agent through browser
onboarding: Learning selection, setup status, live Check setup, reload preserving
readiness and selection, notebook creation and workspace guide handoff.
Screenshots cover 390/1440 widths and light/dark themes; layout.json records
zero findings. Phone light and desktop dark were visually inspected.

The first completed-deployment resume failed because NemoClaw had no unfinished
onboarding session. The implementation now inventories the selected gateway,
refuses unrelated sandboxes and verifies an already completed deployment without
reprovisioning it. operator-resume.log records the successful retry.

An actual SIGTERM interrupted the operator at sandbox inspection. The receipt
became interrupted/failed. Resuming the same deployment completed another live
nonce check. This does not simulate losing power midway through image creation.

The separate UI progress check writes receipt fixtures (no fake inference or
external provider): running, failed, response, ready. Polling preserves choices
and removes the recovery message after recovery.

Validation: 369 Python tests passed with 25 subtests and one skip; 148 JavaScript
tests passed. The final focused local setup/onboarding suite passed 12 tests.
Raw NemoClaw installer logs are private and are intentionally excluded.
