# ADR 0019: Opt-in single-account login for loopback development

Status: accepted, 2026-10-16. Ticket: #68, under #16.

## Decision

`STELLIS_AUTH_MODE=required` adds one account to the existing loopback data directory. First-run registration, login, logout, and a seven-day session are available in the browser. The account record and sessions live in a separate owner-only SQLite file beside the conversation database. A random session token is sent as an HttpOnly, SameSite Strict cookie; only its SHA-256 digest is stored. Passwords use a random 32-byte salt and PBKDF2-HMAC-SHA256 with 600,000 iterations. The server checks the session before any workspace page, legacy or versioned data API, audio response, recording, processing job, or AI run. Health, login, and static assets are public. Mutating browser requests with a foreign Origin fail.

Open local mode remains the default for existing development installs. This gate deliberately permits one account only: all pre-existing data in the selected directory belongs to that account. The cookie is not marked Secure because the service uses HTTP on `127.0.0.1`; this mode must stay on loopback. The CLI's loopback bind is the deployment boundary. No remote multi-user access or encrypted sync is claimed.

## Why this choice

The current database, import deduplication, vocabulary, People, job queue, native worker, and media paths are shared within one service instance. Adding multiple usernames to that instance without owner columns and worker isolation would expose another user's data through collection and ID routes. A single local account provides a real browser login and tests the session gate while preserving the existing device pipeline. Ticket #16 still needs a tenancy boundary, account recovery, and remote session deployment design before remote access; #17 then adds client-owned encryption.

## Verification

API tests cover first registration, duplicate registration, login, logout, missing and forged cookies, expiry, cross-origin mutation, import and audio protection, and AI-route protection. Chromium on an isolated data directory completed registration, workspace reload, logout, denied data access, login, and a 390-pixel reload. No credential or private account data was committed.
