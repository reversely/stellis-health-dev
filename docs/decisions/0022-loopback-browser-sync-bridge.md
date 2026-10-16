# ADR 0022: Explicit loopback browser bridge to the sync origin

Status: accepted for development, 2026-10-16. Ticket: #75 under #17.

## Decision

The separate sync development service accepts credentialed browser requests from one explicitly configured loopback device origin, `STELLIS_DEVICE_ORIGIN`. The default has no cross-origin allowlist. Configuration rejects external hosts, paths, query strings, and origins without a port. CORS returns an exact `Access-Control-Allow-Origin` and credentials permission for the configured origin; it never uses `*`. The service's own Origin check also rejects state changes from every other origin. Both services stay bound to `127.0.0.1` and retain separate databases and cookies. A browser signs in on the account origin, then a page served by the device origin can read account and public vault metadata using `credentials: 'include'`.

This is a connection test, not the conversation sync UI. The device page currently has no Sync control and sends no transcript or audio to the account origin. A later browser adapter must encrypt on the device-origin page and send only ciphertext envelopes. The hosted service must never expose the device's `/api/v1` routes.

## Why this choice and production limit

Browsers treat different ports as different origins, so the browser needs an explicit CORS grant even though both applications are on loopback. [Starlette's CORS middleware](https://starlette.dev/middleware/) supports an exact allowlist and credentials. A wildcard grant would allow other pages to read the account API. In local Chromium, the account cookie was available from the device-origin page with an explicit credentialed fetch because both test origins used `127.0.0.1`.

A public hosted browser page connecting to loopback has additional browser local-network permission behavior; [Chrome's Local Network Access guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/security/local-network-access.md) describes the current checks. Cross-site production cookies and login flow also differ from this two-port loopback test. The durable client contract remains ciphertext envelopes on the sync origin and a local device resource API; production connection may require a short-lived scoped token or a same-site gateway plus explicit local-network permission. That fork remains open before remote deployment.

## Verification

Fifty-two tests pass. A configured-origin test checked credentialed preflight and mutation, denied a different loopback origin, and rejected an external-origin setting. Chromium signed in at port 8769, then from the device page at port 8765 read `/sync/v1/me` and vault metadata and performed an authorized temporary device create/delete across origins. A fresh profile got 401; a page on a third port could not read the response. Browser network evidence included the expected OPTIONS preflights. No conversation or audio endpoint was added to the sync service.
