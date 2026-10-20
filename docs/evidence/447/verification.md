# Integration runtime deployment, 2026-10-20

User feedback: connecting an integration shows “Connection failed” and skips the remaining onboarding.

Observed: the original `stellis.service` runtime on port 8765 was at `1675d85`, containing that exact generic message and predating the current onboarding implementation. Port 8821 was already at `fde46bc`. The reporting browser address has not been confirmed, so this is a verified deployment defect, not proof of the specific provider rejection the user encountered.

Updated the original clean runtime worktree by fast-forward to `fde46bc` and restarted `stellis.service`. Its workspace data and inference configuration were retained. Both services are active, health returns 200, and served onboarding.js/app.js bytes match the tested source. No Tailscale or SSH reconnect was used.

Verification on GN100:
- 21 calendar, account gateway and onboarding tests pass.
- Chromium real local HTTP flow: register isolated account, select Learning, start authorization, return a cancellation on 127.0.0.1 with no initiating localhost cookie. The browser returns to localhost onboarding, keeps Learning selected, shows the cancellation reason, and Continue reaches notebook review.
- This verifies failure recovery, not a fresh successful Google consent/token exchange. The authorization URL was intercepted before contacting Google; the local callback and account routing were real.

The user should reload the existing tab before retrying; existing loaded JavaScript cannot be replaced by a server update. Further investigation of a repeated provider failure requires its current URL and displayed specific error.
