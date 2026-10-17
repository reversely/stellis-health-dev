# ADR 0017: Review user changes before activating changed ASR boundaries

Status: superseded by [ADR 0054](0054-carry-overlays-without-review.md), 2026-10-17. Originally accepted 2026-10-16, ticket #55.

## Decision

A full speech reprocess can create new passage IDs when Whisper changes its boundaries. If any removed source passage has a manual text edit, passage speaker label, highlight, or confirmed Person link, the worker stores the new machine output as an immutable candidate generation and leaves the edited source generation active. Manual acoustic-cluster labels expand into passage review items because a fresh diarization pass can redefine clusters. Word measurement and speaker rematch retain passage IDs and continue activating directly.

Each review item records its source passage ID, timing, displayed wording, speaker, overlay kind and value, and up to five nearby candidate passages with text and time overlap scores. A lone candidate is marked as a close suggestion only when it covers at least 80% of the source interval and has at least 80% text similarity. Suggestions never apply automatically. Split and merged passages show each candidate's full wording and source/target audio controls. The user selects one target passage or explicitly keeps the item unresolved. The device validates candidate IDs and highlight quotes again inside the activation transaction; duplicate mappings of the same overlay kind onto one target are rejected.

Using the new transcript requires a decision for every item. It atomically activates the candidate and copies only explicitly mapped edits, passage labels, highlights, and Person links. Source overlays and immutable machine generations remain for audit. Old acoustic-cluster labels are removed from the active overlay set when a new generation is accepted; their reviewed replacements become passage labels. Keeping the current transcript leaves it active and retains the candidate in generation history. A decision snapshot with source and target versions, item evidence, mappings, outcome, and time is stored in `transcript_review_history` for later clients.

## Why this choice

Offset-derived passage IDs changed from 789 to 806 on the supplied interview's second ASR pass. Joining edits by nearest time alone could attach a correction or Person to another voice at a boundary. Staging the candidate makes the choice reversible until the user reviews it. The browser keeps audio and source text together so the user can resolve splits and merges by listening. Device API decisions make the same review available to a future Flutter client.

## Limits

Mapping a correction to one target passage is an explicit user choice; the service does not split corrected text across multiple new passages. An unresolved change stays attached to the old generation and is shown in the review record after activation. Audio listening remains necessary for speaker identity and exact quote accuracy. Source transcript edits made while a review is pending invalidate activation; the user can keep the current generation and run another transcription. Later encrypted sync must encrypt review evidence and decisions client-side.

## Verification

Synthetic split and merge tests cover a text correction, speaker label, highlight, and confirmed Person; they verify explicit decisions, atomic activation, unresolved retention, source preservation, and decision history. The browser workflow and full interview validation are recorded in the current architecture document when complete.
