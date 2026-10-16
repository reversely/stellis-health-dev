# ADR 0010: One transcript-wide edit session

Status: accepted, 2026-10-16 (#45).

## Context

The browser transcript previously repeated **Edit turn** and **Edit words** controls for every passage. The signed-in Otter interview instead exposes one **Edit transcript** control and one **Done** control. Outside edit mode, its transcript bubbles act as playback/navigation surfaces; in edit mode, the words become editable. Otter also has measured word timing, which Stellis still lacks (#39).

## Decision

- The transcript header owns one Edit transcript / Done state. In normal mode, a click on a passage seeks audio and selection opens highlight/copy. In edit mode, all passage text is editable in place and clicking words positions the caret. Explicit audio controls remain available.
- Browser edits stay local to the active page until Done. A pending count is visible. Done submits all changed passages in one request and one optimistic transcript revision. SQLite validates every source segment ID and the expected revision before writing any edit. It stores per-passage overlays and old/new events, preserving machine text and stable timestamps. No document-wide rewrite occurs on each keystroke.
- A conflict or request failure leaves the editable wording in the page and reports that nothing was saved. Discard edits asks before dropping pending wording. Browser unload with pending wording triggers the native leave warning. A focused passage can restore its machine text, and normal browser undo remains available within each editable passage.
- Speaker changes remain separate. Pending word changes must be saved before changing a speaker so a rerender cannot discard them. Highlights are created only in normal mode, where source offsets are unambiguous.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| One edit form per segment or turn | Repeats controls and forces many save cycles. Replaced. |
| Persist each keystroke | Expensive on a long interview and makes conflict recovery harder. Rejected. |
| One giant contenteditable transcript | Loses stable source passage boundaries and makes speaker/timing preservation difficult. Rejected. |
| Batch per-passage overlays | Keeps Otter-like continuous editing while preserving the existing segment and audio model. Chosen. |

This reproduces Otter's global edit interaction and passage playback. Exact word seeking and active-word tracking require measured alignment in #39; the browser still seeks to each segment's measured start time. The current control layout is a development UI and may change under #23.

## Verification

The 789-passage interview was opened in Chromium. Normal passage click sought audio; one Edit action made all 789 passages editable and removed the repeated Edit turn controls. Three distant passages were changed in one session, saved with Done, survived reload, and were restored through a second edit session. The five-passage browser recording showed the edit state on a 390 px mobile viewport without horizontal overflow. API tests cover atomic multi-passage save, source preservation, stale revision rejection, and invalid-ID rollback.
