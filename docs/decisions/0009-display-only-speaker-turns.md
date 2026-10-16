# ADR 0009: Display-only grouping of transcript fragments

Status: accepted, 2026-10-16 (#38).

## Context

The local ASR emits short timed segments. Showing the speaker label, timestamp, and edit controls on every segment makes a long interview difficult to read. The product still needs each segment's exact seek time, text edit, highlight anchor, and speaker correction.

## Decision

- Build speaker turns in the browser from the current displayed transcript. Adjacent segments join only when they have the same displayed speaker, both assignments are resolved or manually labeled, and the gap is at most 1.5 seconds. A speaker change, uncertain assignment, or longer silence starts a new turn.
- Show each turn as a single flowing paragraph with one speaker heading and a time range. Each underlying segment remains an inline DOM element with its stable ID; clicking that part seeks to its own source time, and playback marks the active part. A user can select text within one segment for a source-anchored highlight.
- **Edit turn** expands that turn into its timed segments and exposes word and passage-speaker actions. The speaker heading can open the existing label editor. Edit mode survives routine transcript re-renders until the conversation changes. Filters operate on original segments after grouping, so hidden segments cannot create a false join.
- Keep the grouping in the view layer. The API, ASR output, corrections, and highlight records remain segment-based. Manual speaker corrections recompose turns on the next render.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| Merge ASR segment text and IDs in storage | Would break precise seeking, edit history, and highlight anchors. Rejected. |
| Group by time proximity only | Could join different or unresolved speakers. Rejected. |
| Show all segment controls in the reading view | Preserves access but leaves dense runs fragmented. Controls appear in Edit turn instead. |

The 1.5-second gap is a readability rule, not acoustic speaker evidence. A provisional error can still put the wrong passage inside a turn; the user can rematch or correct that passage. Selection across multiple source segments remains native copy text, while saved highlights stay within one source segment until cross-segment anchors are designed.

## Verification

The supplied 789-segment interview rendered as 285 turns, including 121 multi-segment turns and a longest turn of 19 fragments. A browser click on the second fragment of one turn sought 0:22 rather than the turn start. Editing and restoring its words preserved the turn; assigning that fragment a different speaker split the turn, and clearing the label restored it. Browser selection, highlight filtering/removal, and AI source-link seeking still worked. Desktop and mobile reading and edit states were visually checked without committing private transcript content.
