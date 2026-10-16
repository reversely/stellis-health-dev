# ADR 0043: Default local login and one-time account recovery

Status: accepted, 2026-10-16. Ticket: #16.

## Decision

The `stellis serve` CLI enables the existing single-account login gate by default. An explicit `STELLIS_AUTH_MODE=open` keeps the previous open loopback development mode. Existing local data is available to the first account registered in its data directory, so users should control that directory and keep the service bound to loopback.

Registration returns one 256-bit random recovery code, displayed once before entering the workspace. Only its SHA-256 digest is stored in the private auth database. An account created before this change receives a code on its next successful login. Recovery consumes the code in the same SQLite transaction that replaces the salted password verifier and deletes all sessions. After signing in with the new password, the browser shows a replacement code. The code is separate from the encrypted vault passphrase and cannot decrypt vault data.

## Limits

This is device-local account recovery, not production remote identity. A lost password and lost recovery code cannot be reset through this service. The sync identity origin still uses its own account and vault passphrase. Remote multi-user authorization, production session transport, and encrypted media sync remain under #16 and #17.

## Evidence

API tests cover single-use recovery, rejection of a wrong code, session revocation, existing-account migration, and the CLI default. A disposable Chromium session completed registration, code display, logout, password reset, replacement code display, and sign-in. The sign-in and reset screens fit 390 pixels without horizontal overflow or page errors.

## References

- [NIST SP 800-63B: look-up secrets](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- [OWASP: forgot password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
