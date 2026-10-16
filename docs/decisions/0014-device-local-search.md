# ADR 0014: Search the current displayed transcript on the device

Status: accepted, 2026-10-16. Ticket: #41.

## Decision

The loopback API exposes `GET /api/v1/search?q=…`. Each request scans the current local conversation list and composes the effective transcript from the active machine generation, user word edits, and current speaker labels. It returns conversation, speaker, and passage hits with source segment IDs and timestamps. The response includes a total and up to 150 displayed hits. Search text does not leave the device.

The browser searches the already loaded transcript for in-conversation navigation. It combines a phrase with one current display speaker name, marks matching passages, and lets Next/Previous seek and scroll. Search never starts playback. A library result opens a direct conversation URL with a segment ID; the browser resolves that ID against the current transcript before seeking, so a stale link cannot blindly seek a different passage.

## Why this choice

A materialized index over machine generations and user overlays would need careful invalidation after edits, rematches, reprocessing, speaker renames, and deletion. Searching the effective transcript on demand makes those operations immediately visible and preserves the current privacy boundary. The real interview search completed in about 37 ms on the development device. If library size makes this too slow, a local FTS index can be added with explicit revision keys and measured invalidation behavior.

## Verification and limits

The API test covers edited wording, speaker rename, two conversations, uncertain speaker metadata, and a replacement ASR generation. Chromium checked library search, a deep link into the 57:49 interview, paused seek, phrase matches, next/previous, speaker filtering, clearing without moving playback, and 390-pixel layout. A second browser conversation was temporarily labeled through the UI, found across the library, and cleared; the old result disappeared.

Search matches a contiguous substring within one passage or speaker name. It does not span passage boundaries, search Edited Transcript versions, rank semantic matches, or synchronize across devices. The 150-hit cap protects browser rendering; the total still reflects all matches. The current product has no conversation deletion UI; a future delete removes the row from the local conversation list and therefore from subsequent search responses.
