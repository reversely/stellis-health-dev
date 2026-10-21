# Explicit notebook agent addressing

Verified on GN100 using isolated accounts and the existing local NemoClaw/OpenClaw route, 2026-10-20.

The actual wireframe screen 1 requests an @ picker for a notebook assistant; screen 5 requests addressing another assistant from a thread. This implementation adds explicit recipient selection to both composers. It does not implement the separate automatic multi-step delegation sequence.

## Live verification

- Typed @Tut and selected Tutor by keyboard. Recipient and typed question survived reload.
- Sent from the notebook steward thread. Actual local Tutor response used its distinct instruction, cited the notebook page and appeared with Tutor attribution in the original thread.
- One shared job appeared in both threads and survived reload.
- Turning the recipient off rejected the request and retained the question.
- Stop reply interrupted a real request from the original thread without publishing a successful reply.
- A second local request produced a document artifact visible in the original thread. The artifact existed only once under the responding agent. Discard from the original thread updated that canonical artifact and survived reload.
- Notebook composer recipient selection survived reload and rejected a disabled recipient.

## Checks and visual evidence

Python: 345 passed, 25 subtests passed, 1 skipped. JavaScript results are retained in javascript-tests.txt.
The direct browser geometry audit covered open and closed picker states at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes: zero findings across 28 states. Only the decorative rail shader was excluded.
Desktop dark and phone light picker screenshots were visually inspected. The choices expand below the input and leave both the question and notebook context visible. The floating overlay was replaced after the audit found overlap.

Browser scripts use disposable fixture accounts and remove their data and processes. The UI-only script requires the installed layout-audit script at /tmp/stellis-layout-audit/layout-audit.mjs. It proves geometry and picker behavior, not inference; live-browser.py proves actual inference separately.
