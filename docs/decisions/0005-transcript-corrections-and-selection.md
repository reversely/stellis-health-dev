# ADR 0005: Transcript corrections and selected highlights

Status: accepted, 2026-10-16 (#13).

## Context

The first local speech run produced timestamped segments and provisional acoustic speaker groups. Browser review of the supplied Otter interview showed a different reading interaction from a list of clickable buttons: transcript text can be selected, a floating toolbar acts on the selection, and playback controls remain available while scrolling. Otter also tracks individual word times; Stellis's current local pipeline only measures segment times.

Reference behavior was checked in the logged-in Otter browser and against [Otter's transcript interaction guide](https://help.otter.ai/hc/en-us/articles/360048464113-Interact-with-your-transcript), [highlight guide](https://help.otter.ai/hc/en-us/articles/21557292299287-Add-highlights-to-your-conversation), and [conversation overview](https://help.otter.ai/hc/en-us/articles/5093228433687-Conversation-Page-Overview). These are interaction references, not data sources for Stellis model output.

## Decision

- Keep immutable machine generations separate from user corrections. `transcript_edits` overrides one segment for display; `transcript_edit_events` records old/new text and revision. The current transcript revision increments on each correction and new machine generation. A stale edit returns HTTP 409.
- Store speaker display labels separately from acoustic cluster IDs. A cluster label applies to all matching turns; a segment label overrides just one passage. Both are reversible and event recorded. The label does not claim to repair the underlying diarization, which remains ticket #29.
- Store vocabulary globally and snapshot terms into each processing job. A changed vocabulary creates a new versioned speech job. The original model output and prior generations remain available; existing manual text is not silently rewritten.
- Render transcript words as selectable text. A click without a selection seeks to the segment start. A same-passage text selection exposes Highlight and Copy. A highlight records its segment ID, character offsets, and original quote. If later edits change that substring, the saved quote remains visible as an outdated highlight and can be removed; it is not silently moved to the wrong words.
- Keep the audio bar visible at the bottom while reading. Native audio controls provide reliable scrubbing; `timeupdate` marks the active segment. The highlights-only view filters to passages with saved highlights.
- Do not infer per-word timestamps from segment duration. Precise word seeking and active-word tracking require measured audio alignment in #39. Grouping adjacent same-speaker fragments into readable turns is #38.

## Consequences

Stable segment IDs let corrections survive a vocabulary re-run when segmentation stays the same. A generation with different IDs retains the edits and highlights as historical records, but they are not projected onto unrelated segments. Cross-generation correction migration needs explicit alignment and review. Highlights currently select within one passage; cross-passage selection can be added once the grouped-turn and word-alignment work establishes a stable text range model.
