# ADR 0006: Browser capture with durable local chunks

Status: accepted, 2026-10-16 (#14).

## Context

The browser is the primary acceptance surface. A single in-memory `MediaRecorder` Blob would be lost when a tab closes, while IndexedDB alone cannot directly feed the local ffmpeg and speech pipeline. The device service already owns private media and imports.

## Decision

- Ask for microphone access when the user presses Start. Prefer Opus in WebM on Chromium, then browser-supported Ogg or MP4. Show permission, missing-device, busy-device, and storage failures in the recording panel.
- Create a recording session on the loopback device service after permission succeeds. `MediaRecorder` emits approximately one-second chunks; the browser sends each chunk in sequence. The service bounds chunk and total size, stores chunks with fsync and SHA-256, and accepts idempotent retries of the same sequence.
- An unfinished session is listed on a later visit with its durable chunk count. The user can recover the saved prefix into a conversation or explicitly discard it. Closing the tab may lose the last in-flight chunk, but earlier acknowledged chunks remain on disk.
- Stop and save waits for acknowledged chunks, verifies their sequence and digest, joins them, and remuxes with ffmpeg using stream copy. Chromium live WebM lacks `format.duration` metadata; remuxing adds duration without re-encoding. The result enters the same validated import, playback, and on-device speech path as an uploaded file.
- Pause/resume uses the browser recorder when available. Pause, resume, and device-ended events are stored with their captured-media position and UTC time, so wall-clock pauses are explicit metadata rather than pretending media time advanced. The imported playable timeline is the captured audio timeline.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| One Blob until Stop | Simple, but tab interruption loses the whole recording. Rejected. |
| Browser IndexedDB as the only durable store | Helps offline capture, but needs a second transfer to the local speech service. A future offline adapter could add it. |
| Stream PCM directly into Python | Would require custom timing, encoding, and browser backpressure handling. MediaRecorder plus bounded chunks uses the browser encoder. |
| Re-encode after capture | Can normalize formats, but changes quality and costs CPU. Stream-copy remux was sufficient in a real Chromium microphone check. |

The service remains loopback-only and unauthenticated; remote recording and cross-device recovery require the auth/sync tickets. The saved prefix may lack a complete final utterance after an abrupt close. The UI calls it an interrupted recording until the user recovers it.

## Verification

Generated WebM integration tests cover ordered chunks, duplicate/conflicting retries, gaps, events, recovery, import, and playback. Chromium was granted the user's microphone, recorded with pause/resume, and saved a playable conversation. A separate spoken sample passed through the browser recorder and on-device pipeline, producing five transcript segments and one acoustic speaker group. Closing a browser tab before Stop left saved chunks listed on the next visit; recovery imported the partial recording.
