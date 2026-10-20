# Integration return routing

Observed defect: authorization is served by an account child process. Google returns to 127.0.0.1 even when setup started on localhost. Routing that callback with the callback host's session cookie can select another account; its process-local OAuth state is absent, producing a generic failure and Home redirect.

Verified with a real gateway and Chromium: register on localhost, select Learning, click Connect, return via the generated 127.0.0.1 callback with provider cancellation and no cookie on that host. The original localhost onboarding screen, Learning selection and cancellation reason remain. Continue reaches notebook review. This deliberately exercises cancellation; it does not claim a new successful Google consent/token exchange.

Real HTTP regression additionally starts authorization in account two, restarts the gateway, and delivers the callback with account one's cookie. It returns to account two's original onboarding URL, retains setup choices and rejects replay. The shared pending-state store holds hashed state keys, account ownership, PKCE verifier and trusted return location with a ten-minute lifetime and one-use consumption.

Learning is now generic and creates no product-specific page or learning plan. Existing user notebooks/pages are preserved.

Checks: 331 Python tests and 25 subtests passed; one platform skip. All 148 JavaScript tests passed. Chromium screenshots inspected for the preserved onboarding step and generic learning review.
