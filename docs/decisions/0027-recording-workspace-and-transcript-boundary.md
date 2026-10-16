# ADR 0027: Browser recording workspace and transcript boundary

Status: implemented in ticket #90, 2026-10-16.

## Decision

Record opens `/recording` in the same browser tab and requests the microphone immediately. The route survives reload and shows recoverable sessions. The workspace keeps the transcript and AI areas visible beside a fixed recorder with the actual microphone source, English model label, elapsed time, Pause/Resume, and Stop. Title edits update the unfinished session before finalization. The existing one-second chunk upload, ordered integrity checks, remux, and import path remain the durable capture mechanism.

The transcript area says when the transcript becomes available. It does not display a fabricated live transcript. Current whisper.cpp processing starts after the recording is finalized; the AI area becomes usable from the saved conversation. A genuine provisional on-device transcript remains #98; notes and agent during capture remain #86.

## Why

The previous Record action opened a small panel in the library and required a second Start action. That obscured recording state and separated it from the transcript workflow. The route and fixed recorder make capture state visible on desktop and narrow browsers without changing the device storage contract. Using browser speech recognition for live text would not prove on-device processing or preserve the finalized model's provenance. The saved transcript continues to come from the device's whisper.cpp job.

## Limits

The browser can leave an empty session if it closes before MediaRecorder emits its first chunk; recovery lists that session with a disabled Recover action and a Discard action. A stopped recording and a later recovered recording both enter the usual conversation processing path. Live on-device ASR remains #98; soundwave, note editing, and agent chat during capture remain #86.
