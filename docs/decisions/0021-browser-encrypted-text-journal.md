# ADR 0021: Browser-encrypted text journal prototype

Status: accepted for development, 2026-10-16. Ticket: #73 under #17.

## Decision

The separate identity origin stores an account-owned, append-only journal of opaque text ciphertext envelopes. It accepts only an entry UUID, an opaque item UUID, a 12-byte IV, and bounded base64 ciphertext. The browser derives a nonextractable AES-256-GCM key from a **separate vault passphrase** with PBKDF2-HMAC-SHA256 (600,000 iterations) and a server-stored random 16-byte salt. A short encrypted vault check rejects a wrong passphrase before showing notes. Every entry gets a fresh random IV and authenticates the account ID, item ID, and entry ID as additional data. The server does not derive, receive, or store the vault key or passphrase. The browser queues encrypted envelopes in IndexedDB while offline and pushes them after reconnection. Pulls use a monotonic server cursor; identical repeat pushes return their original entry sequence.

This is a text-note prototype in the account shell. It does not sync the device app's conversations, edits, audio, speakers, or AI results. The account service cannot decrypt note bodies. Device names, account IDs, opaque item IDs, entry sizes, order, and timing remain visible to it. [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto/) defines the AES-GCM encryption/decryption and PBKDF2 browser operations used here.

## Threat boundary and limits

| Threat or condition | Current behavior |
| --- | --- |
| Server database disclosure | Stores salt, IVs, and ciphertext, not note text or a content key. A weak passphrase can still be attacked offline using the public check ciphertext. |
| Entry tampering or wrong passphrase | AES-GCM authentication fails in the browser; the note is not displayed. The browser surfaces an explicit error. |
| Another signed-in account | All vault and journal SQL queries use the session's account ID. Opaque IDs from another account do not grant access. |
| Offline write or duplicate request | Encrypted envelope stays in the browser queue and is retried. Duplicate entry ID with the same bytes returns the same sequence; conflicting bytes fail. |
| Malicious server omits, reorders, or replays valid entries | Not yet detected cryptographically. Cursor order gives deterministic convergence against an honest service, not rollback protection. A signed hash chain or comparable transparency mechanism is needed before a strong E2EE claim. |
| Compromised browser script, extension, or device | Can read plaintext after unlock. Script delivery, device keys, and recovery need separate review. |
| Device removal or account password reset | Device names are metadata, not cryptographic enrollment. Removing one does not revoke an already known vault passphrase. There is no vault recovery or key rotation yet. |

PBKDF2 was chosen because it is available through standard browser Web Crypto without an extra library; a future threat review may choose a memory-hard derivation for user passphrases. The key lives only in page memory and is not extractable through the Web Crypto API. This does not make an unlocked, compromised page safe.

## Verification

Fifty-one tests cover per-account vault and entry isolation, size and IV validation, immutable vault salt, append-only cursors, idempotent entry IDs, and conflict rejection. Two isolated Chromium profiles on one account decrypted the same note. One created another note offline and synced it after reconnecting; the other pulled and decrypted both. A wrong passphrase failed at the vault check. Modifying a saved ciphertext in a disposable database produced an authentication error and no displayed note. Captured vault and entry POST bodies contained only salt/check and opaque envelope fields; a raw database-byte check found neither the sample note nor the vault passphrase. The account page fit 390 pixels. These are development checks, not a production E2EE audit.
