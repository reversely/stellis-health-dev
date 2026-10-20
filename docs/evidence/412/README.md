# Local screen tutor verification

Reference inspection and adaptation: `docs/research/clicky/README.md`; architecture: ADR 0064. Executed remotely on GN100 using the existing connection, installed Qwen vision model and independent NemoClaw sandbox `stellis-local` (8990). No model downloads or change to the original service/gateway.

- Actual browser capture of Stellis's Add agent form was uploaded through the Tutor UI. Local `qwen3.5:9b` identified its controls; managed Nano produced a cited next step; the suggested point fell inside the actual Add agent button bounds. `real-runtime.json` records the geometry and answer; `shared-real-ui.png` is the captured source.
- Desktop 1440 and phone 390 in both themes show the captured frame, guidance and pointer. Preview links use the same trusted citation renderer as the thread. Stop sharing clears images and disables Ask. Invalid PNG shows a readable error; navigation clears sharing; reduced motion disables the frame animation.
- A real request cancellation initially exposed a middleware disconnect-probe bug: the browser cleared but the backend continued. Replaced polling with an awaited ASGI receive channel. A subsequent real vision request ended `interrupted` after 1242ms, without a teaching turn. The browser verification asserts this stored trace outcome.
- Seven-width geometry audits in both themes: zero failures and zero warnings after enlarging inline source and back-link targets. Reports are retained.
- Full Python suite: 308 passed, 1 skipped, 25 subtests. JavaScript: 159 passed. Final relevant Python checks after disconnect fix: 20 passed. Existing FastAPI deprecation warnings remain.
- The first full model run failed source validation; an isolated diagnostic and subsequent complete browser runs returned valid citations. The existing retry/error boundary stays strict; no citations are fabricated to conceal model failures.

Limits: GN100 headless verification uses real screenshot upload, not the interactive OS window-selection dialog. Window sharing requires browser support and a secure context. Images are transient; textual observations and answers remain in chat. No cloud screen tutoring, unattended watching, computer actions or guaranteed grounding is claimed.
