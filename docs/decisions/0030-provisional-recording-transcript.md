# ADR 0030: Provisional on-device transcript during browser recording

Status: implemented in ticket #98, 2026-10-16.

## Decision

The existing one-second MediaRecorder chunks remain the durable source of a recording. After at least five chunks are saved, and then roughly every eight more chunks, the browser requests a local preview from the device API. The API verifies a contiguous chunk snapshot and each selected chunk's digest. It joins the WebM header chunk with up to twenty recent chunks, uses packet timestamps to locate the recent cluster, and limits decoded mono audio to a thirty-second window. A local whisper.cpp model transcribes that window. The browser displays the result as **Provisional transcript** while capture and chunk uploads continue.

The device keeps one preview task at a time and stores its latest merged passage list in an owner-only recording directory. New windows replace overlapping provisional wording; earlier passages remain visible. Model padding is clamped to decoded media duration. Silence can yield no passages. Preview failures do not stop capture, and finalization continues to import the verified full recording for the existing isolated speech and diarization job. Finalization removes the provisional snapshot; permanent deletion removes the recording directory.

## Why this fork

The browser's MediaRecorder chunks are not independent files. A direct Chromium fixture showed that the first WebM chunk plus a later tail decodes, with packet timestamps retaining the source media position. This permits a bounded inference window without retranscribing a growing hour-long file. The preview uses the same local model as final ASR and sends no audio to Nebius or a browser speech service. Its wording is explicitly provisional because short-window decoding can differ from the final source generation.

## Limits

The current browser emits chunks about once a second; packet-time trimming caps model input at thirty seconds if chunk cadence changes. Preview segments have no final speaker identity or word anchors. A page reload ends the browser capture; saved chunks remain recoverable and the latest provisional result remains readable until recovery or discard. Final short-clip ASR can still omit audible opening words or report a time beyond media duration; #106 tracks that separate final-generation defect. Notes and AI during capture remain #86.
