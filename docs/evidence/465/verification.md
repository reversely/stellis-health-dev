# Recording filing and Undo (#465)

Actual references: screen 6 names the selected Saving to destination and says Stop files the meeting. Screens 3/4 show the resulting filing with Undo. The selected notebook already survived finalize; this change supplies its durable activity event and reversible membership.

## Verified

- Actual browser MediaRecorder with Chromium synthetic microphone input: fresh-account source-reviewed setup, Record from its notebook, retained destination, Stop, saved meeting, activity source link, Undo/reload, byte-identical audio and retained recording notes. Recording notes were supplied through the real notes API before Stop. This does not claim physical microphone or native system audio capture.
- First script tried Start again, but notebook Record already starts capture. Corrected the test to follow the actual interaction. Initial narrow screenshot raced activity loading; final run waits for the populated filing row and team before captures/audits.
- Fourteen viewport/theme states have zero geometry findings. Populated desktop dark and phone light filing states inspected, plus the recording destination capture.
- Real encoded WebM unit/API checks: finalize creates one filing, Undo preserves renamed title/audio, repeat Undo/finalize does not refile, identical-media import into another notebook creates no false event. Conversation-state tests preserve later moves/deletions and unassigned recordings produce no event. Existing source-note history/Undo remains covered.
- Full suite: 361 Python tests, 25 subtests, one skip; 148 JavaScript tests. Final focused rerun after the move/delete case: 8 passed.

## Limits

No model inference is needed for deterministic filing reversal. This test does not prove live speech understanding, the full recorded-speech-to-task-review chain, native audio capture, or inference-based destination proposals. Source Compare, confirmed sending, cloud execution and original integration retry remain separate gaps in the full workflow.
