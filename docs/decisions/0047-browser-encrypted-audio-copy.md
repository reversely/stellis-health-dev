# ADR 0047: Browser-encrypted audio copy

Status: accepted for development, 2026-10-16. Ticket: #17.

## Decision

Extend the existing encrypted transcript snapshot with a bounded audio copy. The device browser streams the local audio response in 256 KiB chunks. It encrypts each chunk with the unlocked browser vault key and a fresh AES-GCM IV. Authenticated data binds the account ID, opaque media UUID, and zero-based chunk index. The separate sync origin accepts and serves only account-owned ciphertext chunks. Identical retries are idempotent; conflicting bytes are rejected. The encrypted manifest is sent only after every audio chunk and transcript part succeeds. It records the encrypted media ID, count, MIME type, and source byte length. The account browser verifies all chunks and their total length before exposing an audio player.

The server bounds a copy to 512 chunks and total encoded media storage to 192 MiB per account. Existing text-only snapshots still render. The account view loads audio only on request and revokes object URLs when it locks or rerenders.

## Threat boundary and limits

The sync service never receives an audio content key or plaintext audio. It can see account identity, chunk sizes, count, order, upload timing, and opaque media IDs. AES-GCM rejects changed ciphertext, IVs, or chunk order in the browser. An honest server returns the stored chunks; a malicious server can still omit a whole snapshot or replay an older one because the journal has no rollback protection. Browser script or device compromise can read unlocked plaintext.

This is a one-way copy for a manually chosen conversation. It does not propagate edits or deletions, resume an interrupted media upload across browser restarts, revoke a device that already knows the vault passphrase, or sync larger recordings. Those remain open in #17. The account page currently assembles the bounded recording in memory before playback.

## Evidence

API tests cover per-account isolation, chunk bounds, idempotent retries, conflict rejection, and vault prerequisite. In two isolated Chromium browser profiles, a public WAV sample and transcript were encrypted from the device origin, then decrypted into an audio player at the account origin at 390 pixels. The returned bytes began with the expected WAV header. The disposable sync database contained neither sampled transcript text, WAV header, nor vault passphrase. Altering one stored ciphertext chunk prevented the account browser from creating an audio element.

The shared Web Crypto contract and vault limits remain in [ADR 0021](0021-browser-encrypted-text-journal.md); [ADR 0023](0023-encrypted-conversation-snapshots.md) records the text snapshot format.
