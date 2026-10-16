# ADR 0023: Browser-encrypted conversation text snapshots

Status: accepted for development, 2026-10-16. Ticket: #77 under #17.

## Decision

The device browser reads the selected conversation's effective transcript through its local API and encrypts a bounded text snapshot before sending it through the existing ciphertext journal. A shared browser module defines the snapshot format for both origins. Each encrypted part contains at most ten passages and 45 KB of plaintext; an encrypted manifest with ordered part IDs is sent last. The account browser renders only complete manifests as read-only text with source passage links. The sync service has no conversation or audio API and cannot read titles or passage text.

The **Sync transcript** action is in the conversation's three-dot More options menu, alongside Delete, Regenerate summary, Rematch speakers, word alignment, and reprocessing. The user signs in at the separate account origin and enters the existing vault passphrase on the device page. The device page verifies the vault check before encrypting the snapshot. Audio remains on the recording device.

## Why and limits

The existing append-only ciphertext journal can carry bounded text snapshots without creating a plaintext server-side conversation model. The final manifest keeps an interrupted upload from appearing complete. An interrupted attempt can leave orphan encrypted parts, which the account browser ignores; retry creates a new snapshot. Shared validation checks part order, source snapshot ID, passage count, unique passage IDs, and timing shape. This is a one-way text copy: later device edits do not update an earlier snapshot, source links work only when that local device service is reachable, and the account page cannot play audio. It is not full conversation/media sync or a production E2EE claim. The service still sees envelope sizes, order, timing, and opaque IDs; rollback protection, account recovery, key rotation, and remote loopback authorization remain open under #17.

The Web Crypto choices and threat boundaries remain in [ADR 0021](0021-browser-encrypted-text-journal.md). The loopback browser bridge and production connection fork remain in [ADR 0022](0022-loopback-browser-sync-bridge.md).

## Verification

The supplied 57:49 interview crossed the browser bridge as 79 encrypted entries and opened in a second Chromium profile as a 777-passage text snapshot with passage links. Captured requests and the sync SQLite file contained no sampled title or passage phrase in plaintext. A forced failure before the final manifest left no visible snapshot; reload and retry showed one complete snapshot. Fresh-session and wrong-vault-passphrase states were checked at 390 pixels. The shared format checks cover bounds, highlight preservation, missing and reordered parts, duplicate IDs, source mismatch, and passage count.
