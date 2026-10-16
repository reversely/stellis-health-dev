# ADR 0002: Local browser import and replay

Status: accepted for the first product slice (ticket #11, 2026-10-16)

## Decision

The browser owns import and playback. A loopback-only FastAPI service stores the original audio in a private local directory and a small SQLite index. An Otter ZIP is read as an archive; the sole supported audio member is imported, while its transcript is left untouched until the transcript data model is ready. The browser uses its native audio element for playback, range requests, scrubbing, and accessible controls.

## Forks considered

| Fork | Choice | Reason and consequence |
| --- | --- | --- |
| Browser-only IndexedDB vs. local service | Local service | The same durable file path can feed ffmpeg, whisper.cpp, and sherpa-onnx without copying large recordings between browser and Python. This makes the macOS host a requirement for this slice. |
| SQLite vs. flat JSON metadata | SQLite | Atomic inserts and a unique audio digest make retries idempotent and prepare for transcript and speaker relations. A later schema migration mechanism will be needed as the model grows. |
| Starlette/FastAPI upload vs. custom streaming protocol | `UploadFile` via `python-multipart` | Integrates with the browser's standard multipart form and can spool large files to disk. The importer streams in 1 MB chunks and enforces a 1 GB limit. |
| Browser audio vs. decoded PCM transport | Native `<audio>` with Starlette `FileResponse` | Browser seeking uses standard byte ranges and the original codec. Word-level synchronized highlighting still needs timestamped transcript data in tickets #12–#13. |
| Trust ZIP metadata vs. validate extracted audio | `ffprobe` validation after bounded extraction | Rejects unsupported or corrupt media and obtains an actual duration. `ffprobe` is a required native tool. |
| Match duplicate names vs. audio bytes | SHA-256 of audio bytes | A renamed recording opens its existing conversation; two exports of the same audio do not make duplicate rows. |

## Privacy and limits

The service binds to `127.0.0.1`. Audio and SQLite files have owner-only permissions; the data directory is outside Git, with an override for tests. The API returns public conversation fields and streams audio without exposing a filesystem path. There is no identity boundary yet. Ticket #16 must add authentication before the app is exposed beyond loopback or shared among users; #17 must assess encryption at rest and cross-device synchronization.

The 1 GB limit bounds uploaded and extracted bytes, including misleading ZIP size metadata. The current import request still waits for duration validation before returning, and there is no resumable upload or progress percentage. Ticket #14 should address recovery for recordings; ticket #18 should exercise large import and failure paths.

## Verification

A generated WAV integration test covers import, duplicate detection, persistence, range playback, invalid files, and Otter-style ZIP selection. The supplied 57:49 Otter export was imported through Chromium; the browser reached the conversation page, loaded seekable media, jumped to 10 seconds, and reopened the same recording after reload. A fresh checkout installed from `uv.lock` and passed the tests.
