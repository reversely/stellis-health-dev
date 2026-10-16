# ADR 0042: Private comments anchored to transcript excerpts

Status: accepted, 2026-10-16.

## Context

Otter's selected-text Comment action opens a focused textarea with placeholder **Add a comment** and a disabled send control while empty. The signed-in reference probe did not submit a comment, so persistence and collaboration behavior are unknown. Stellis already stores selected highlights by source passage ID, character offsets, and exact quote; ASR reprocessing can replace passage IDs.

## Decision

The browser adds Comment beside Highlight and Copy after a selection within one source passage. A compact Comments section holds the composer and saved entries. The device API stores each comment body, exact selected quote and offsets, source passage ID, and original audio start time in private SQLite. A current exact quote gets a dotted underline in the transcript. If a word edit changes that range, the comment remains readable with **Source changed**; a replaced passage remains readable as **Earlier transcript** with its original audio time. The UI does not silently move either anchor.

The ASR generation review includes affected comments as separate overlays. A comment moves only when the user explicitly maps it to a candidate passage containing its quote exactly once; the same comment ID and body are retained and its source time is updated. Ambiguous or unresolved comments remain on their earlier passages. Permanent deletion removes comments in the same conversation transaction; Recently Deleted retains them until restore or purge.

Comment text remains on the device. It is returned only through the same-origin conversation API under the existing optional login gate. It is not added to Nebius prompts or encrypted text snapshots. Cross-device comments require a later versioned encrypted contract. Comment body edits are local last-write-wins in this development architecture.

## Verification

API tests cover stale transcript revision, exact quote, durable reload, changed wording, body edit/delete, explicit generation remap, and permanent deletion. On the real 57:49 interview, Chromium created a comment from selected opening text, reloaded the underlined passage and comment, edited and deleted it, and directly verified the SQLite anchor and cleanup. A second comment at 2:02 sought and played that original audio time before deletion. Desktop and 390-pixel views had no horizontal overflow. The temporary comments were removed from the real interview.
