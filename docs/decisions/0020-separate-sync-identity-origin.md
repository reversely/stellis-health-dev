# ADR 0020: Keep hosted identity separate from the device service

Status: accepted for development, 2026-10-16. Ticket: #71 under #16.

## Decision

Run a second FastAPI application with `stellis sync-serve` on a separate loopback port and private data directory. Its database holds development usernames, salted password verifiers, hashed random session tokens, and account-owned device names/IDs. The browser account shell can register, sign in, list and revoke its devices, log out, and revoke all sessions. Sessions expire after seven days; mutating requests with a foreign Origin fail. The service's host check and CLI bind restrict it to loopback, where HTTP cookies are usable. No transcript, audio, Nebius, speech, key, or sync-content route is mounted there.

The existing `/api/v1` device service remains a local plaintext worker and browser product. Its optional single-account gate (#68) protects a local development folder; it is not the multi-user hosted identity. The two services do not share cookies, databases, or session tables. The identity origin is the place to attach future ciphertext-only sync routes after #17 defines client-side encryption and vault ownership.

## Why this choice

Adding remote account routes to the device app would place plaintext recording, transcript, native processing, and Nebius endpoints on an internet-reachable origin. Separate applications make that accidental exposure harder and let the account service enforce per-user membership without changing the local worker's storage. The first release is one user's devices; a simple development password flow lets browser sessions and isolation be exercised now. Production OIDC, HTTPS/Secure cookies, account recovery, device credential enrollment, and ciphertext sync remain required before external deployment.

## Verification and limits

Fifty tests pass, including two-account isolation, cross-account device revocation failure, login/logout, forged and expired sessions, revoke-all, Origin rejection, and absence of device conversation/audio routes. Two isolated Chromium profiles registered, then one added devices while the other's list stayed empty; logout returned 401, and `/api/v1/conversations` returned 404 on this origin. A device-form async refresh bug found in Chromium was corrected. The account page fits 390 pixels. This checks identity metadata only. Device names are not encryption keys, and no end-to-end encryption or remote production security is claimed.
