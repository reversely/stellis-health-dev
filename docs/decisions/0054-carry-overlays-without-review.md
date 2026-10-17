# ADR 0054: Carry user changes onto a new transcription without a review screen

Status: accepted, 2026-10-17. Supersedes [ADR 0017](0017-asr-generation-review.md).

## Context

ADR 0017 kept a changed transcription inactive until the user reviewed each moved edit, speaker label, confirmed person, highlight, comment, and selected image. Reprocessing "How it works" re-cut one confirmed passage into two sentences, and the conversation showed a "Review new transcription" screen. That screen listed per-overlay rows such as "person, 0:00, split", asked the user to listen to both passages, and required a choice from a dropdown before the new transcript could be used. The repo owner rejected the whole flow on 2026-10-17. A conversation must look and work like every other conversation, and a user should never have to approve their own existing name or edit again.

## Decision

- A reprocess always activates the new transcription. `generation_review.stage` returns `"applied"`, or `None` when nothing depended on the changed passages. The review panel, its API routes, and the library's "ready to review" state are removed.
- Overlays move automatically when their new home is unambiguous:
  - A speaker name or confirmed person goes to every new passage that lies at least 80% inside the old passage's time, provided those passages cover at least 80% of it. This is the split and re-cut case. Otherwise it goes to the new passages that lie at least half inside the old passage's time, or else to the single new passage that overlaps it most. When no new passage covers the old time, the name is dropped. A name never keeps an old passage in place: on 2026-10-17 that rule preserved 6 looping Whisper passages in Hackathon Project Planning and Ideation because they carried a person link.
  - A text edit moves only to a single new passage with at least 80% overlap and at least 95% matching machine text.
  - A highlight, comment, or selected image moves to the one overlapping new passage that contains its quote exactly once.
- When an overlay has no unambiguous home, the user's old passage is kept as written. It replaces the new passages centred inside its time, keeps its ID and every overlay on it, and takes the speaker group of the new passage it overlaps most. The rule repeats until every overlay is resolved, so nothing is dropped and nothing asks.
- Activation deletes edits, passage labels, person links, and highlights that still point at passages absent from the new transcript, so names are not counted twice.
- On startup, any review left pending by the old flow is resolved with the same rule.

## Tradeoffs

A kept passage keeps its earlier boundaries and machine words, so a split that would have helped there does not happen until the user's edit is removed. Speaker names on a merged passage are not spread to speech from other passages; that passage is kept instead. Developer-facing details of what moved are not shown in the product. They can be reported in a development document when needed.
