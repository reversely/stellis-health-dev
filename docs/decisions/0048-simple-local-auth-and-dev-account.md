# ADR 0048: Simple local account flow and explicit dev account

Status: accepted, 2026-10-16. Ticket: #16. Supersedes the recovery portion of ADR 0046.

## Decision

The local browser account screen offers Sign in and Sign up. The first normal signup claims the one local data directory. Later signup is unavailable on that directory. Authentication then goes directly to the workspace; there is no recovery-code interruption or local password-reset endpoint. A separate identity service remains the multi-user prototype.

A developer may explicitly set `STELLIS_DEV_ACCOUNT=1` and `STELLIS_DEV_PASSWORD` on the loopback device service. Username `dev` then signs in with that password without claiming the normal account or meeting its 12-character minimum. The dev session is stored separately and works only while that setting remains enabled. It accesses the same local workspace, so it is for trusted local development only. File-size and processing safety limits still apply.

## Limits

This local account is not production identity or a per-user data store. A forgotten normal password has no self-service reset in this implementation. Production account recovery and remote user isolation need a separate design.
