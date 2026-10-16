# ADR 0011: Separate, versioned cleaned transcript

Status: accepted, 2026-10-16 (#48).

## Context

A transcript should be readable and quotable without losing what the local speech model heard. Cleanup can remove fillers or recognition artifacts, but a generative model can also change names, numbers, or meaning. The browser must keep source timing for playback and preserve earlier results after manual corrections or reprocessing.

## Decision

- **Clean transcript** is an explicit Nemotron action in Summary & AI. The device service sends bounded passages of displayed transcript text and speaker labels to Nebius; audio and credentials stay local. A strict JSON schema requires one output per input segment in order. Each result carries its source ID, original text, timestamp, displayed speaker, cleaned text, and review flag.
- The service checks source IDs and count, number preservation, proper-name preservation, token overlap, substantive insertions, and unsafe deletions. Only nonsemantic fillers, an exact adjacent repeated word, and the discourse phrase "you know" may be removed without an audio-review flag. Suspect output falls back to narrow local filler removal or exact source text and is marked for review. The versioned prompt forbids borrowing from neighboring passages. The browser rechecks earlier clean versions with the current safety rule before display. This validator is a guardrail, not proof that remaining prose is factual. The UI asks users to check the recording before quoting.
- A clean run is its own SQLite resource keyed by transcript revision, model, and prompt version. Chunk results are checkpointed. Failed or interrupted runs can retry; edits to the source create a new version while prior clean versions remain accessible and marked stale. Cleaned-word edits are overlays with an independent optimistic revision and do not touch the original transcript or highlights.
- **Edited Transcript** appears as a third conversation tab after a successful run. It composes same-speaker turns for reading, yet each source passage remains separately clickable and seeks to its original start time. Playback marks the active passage. One Edit/Done mode saves changed passages atomically. A contextual Compare panel shows source and edited wording, plays the source, restores generated or exact source text through the edit mode, copies a passage, and records audio review.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| Rewrite original transcript in place | Would destroy evidence and make earlier highlights ambiguous. Rejected. |
| Ask the model for a single rewritten document | Would lose stable passage-to-audio mapping and make omissions hard to detect. Rejected. |
| Use a new `ai_runs.kind` value | The existing SQLite `kind` check allows summary and answer only; migration would need to rebuild the table. A separate clean resource keeps this change isolated. |
| Accept every schema-valid output | A schema cannot establish quotation fidelity. Local conservative checks and review flags are required. |

## Verification

Automated tests cover source timing and original preservation, atomic edited-word overlays and stale revisions, audio review, incomplete output, changed numbers, dropped names, added claims, unsafe deletion, and legacy-version safety. Chromium validation on a browser-recorded sample confirmed the third tab after generation and that clicking a later edited passage sought to its stored 4.52-second source offset and started playback. The full 789-passage interview completed with real Nebius calls; the v2 result changed 157 passages and flagged 82 for review. A retrospective v3 safety audit found 10 passages whose displayed text needed fallback and 12 additional review flags; the browser now applies that safeguard to earlier versions. Browser checks covered seeking later audio, two distant passage edits in one save/reload, source comparison, audio-review confirmation, and 390-pixel layout. These checks do not establish quote fidelity for all 789 passages; flagged wording still needs audio review.
