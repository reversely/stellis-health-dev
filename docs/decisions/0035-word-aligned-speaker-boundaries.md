# ADR 0035: Split ASR passages at clear acoustic speaker boundaries

Status: accepted for development, 2026-10-16.

## Context

Whisper can put two voices in one passage. The diarizer can locate the change, but assigning one cluster to the whole passage mislabels one voice. The real interview has such a passage in its opening exchange: the acoustic turns change near 8.6 seconds while the ASR passage continues to 9.5 seconds. The Otter export and signed-in transcript give a weak reference for the turn; neither is an inference input.

## Decision

After local ASR and diarization, split a passage only when measured word offsets exactly cover its text and a word boundary agrees with a nearby change between distinct acoustic turns. Require useful speech on both sides and each resulting part to be dominated by its corresponding acoustic cluster. Leave overlap, missing word timing, and short cluster flips unsplit for review. Then run the existing overlap assignment on each part.

Derive each passage ID from its original ASR index and its own start/end times. An unaffected passage keeps its ID even when an earlier passage splits. Existing active generations and their edits stay intact; reprocessing stages a candidate for explicit review before activation. No model, hosted service, or speech transport changes.

## Consequences

This can correct clear within-passage speaker changes without re-running ASR or adding a model. A strict guard favors unresolved mixed passages over false splits. Word timing can be approximate, so the split cannot establish the true speaker by itself. The browser still needs the user to confirm identities; a diarization cluster is not a Person.

The separate transcript generation and review flow remains the boundary for migrating edits, highlights, and confirmed Person links. Splitting creates new IDs for the two changed parts, so those overlays require review; other passage IDs stay stable. Benchmarking heavier diarization remains ticket #37.
