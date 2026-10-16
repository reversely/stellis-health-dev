# Current architecture (development)

Last updated: 2026-10-16, ticket #12. This page describes the running code after #12 merges. Proposed components are in [ADR 0003](decisions/0003-cross-client-architecture.md) and are not drawn below.

The browser client shown here is the running development product and primary acceptance surface. Flutter is required for the native iOS app and the shared iOS/Android/desktop stretch in ticket #25; it is not yet part of the running architecture. Flutter web is optional.

```mermaid
flowchart LR
  U[User] --> C[Chromium browser]
  Z[Otter ZIP or audio] -->|select or drop| C
  C -->|HTML, CSS, JS| F[FastAPI static routes]
  C -->|/api/v1 JSON + multipart| A[FastAPI device API]
  C -->|HTTP byte ranges| A
  A --> I[Import validator]
  I -->|ffprobe| P[ffprobe]
  I --> D[(SQLite: conversations)]
  I --> M[(Private original media)]
  A --> D
  A --> M
  A --> J[Single job queue]
  J -->|launches| X[Isolated speech process + job lock]
  X -->|decode mono 16 kHz| E[ffmpeg]
  X -->|segment ASR| W[whisper.cpp + English small model]
  X -->|acoustic turns| S[sherpa-onnx + Pyannote/TitaNet models]
  X -->|jobs, segments, turns| D
  X -->|reads source| M
```

## Runtime and ownership

| Component | Current implementation | Owns |
| --- | --- | --- |
| Browser UI | Plain HTML, CSS, and JavaScript in `src/stellis/static/` | File selection/drop, conversation list, player, automatic processing request, job status, timestamped transcript display and click-to-seek. |
| Device service | FastAPI in `src/stellis/server.py`, started by `uv run stellis serve` | Loopback HTTP (`127.0.0.1:8765`), API routes, static UI, audio range responses, worker startup. |
| Importer | `src/stellis/importer.py` | Bounded multipart/ZIP extraction, SHA-256 deduplication, `ffprobe` duration/stream validation. |
| Storage | `src/stellis/storage.py` | SQLite conversation, processing-job, and transcript records; private original media under `~/Library/Application Support/Stellis` or `STELLIS_DATA_DIR`. |
| Speech worker | `src/stellis/processing.py` and `src/stellis/worker.py` | One queue, isolated child process with per-job file lock, restart requeue, ffmpeg decode, whisper.cpp segment ASR, sherpa-onnx acoustic turns, overlap alignment, aggregate metrics. |
| Model distribution | `scripts/setup_models.sh` | Downloads pinned model files to private local storage and verifies SHA-256; models do not enter Git. |
| Hosted services | None in running app | Nebius credentials have only been verified separately; no production AI call path yet. |

## Implemented connections

- `GET /` and `GET /conversation/{id}` serve the same browser shell.
- `/api/v1/health`, `/api/v1/conversations`, `/api/v1/conversations/import`, `/api/v1/conversations/{id}`, and `/api/v1/conversations/{id}/audio` provide import and replay. Legacy `/api` aliases remain.
- `/api/v1/capabilities` reports actual local English ASR and diarization readiness. `POST /api/v1/conversations/{id}/processing-jobs` starts or returns an idempotent job. `GET /api/v1/conversations/{id}/processing-job` and `/api/v1/jobs/{id}` support browser reload and polling.
- `GET /api/v1/conversations/{id}/transcript` serves model-generated timestamped segments and acoustic turns. The browser shows anonymous speaker groups, flags uncertain assignments, and seeks audio when a segment is selected. Word timestamps are absent.
- Imported Otter ZIPs contribute only the audio member. Their transcript and summary are private reference files and are not ingested as model output.

## Current boundaries and gaps

The service is loopback-only and has no login, per-user authorization, hosted sync, encryption, native recording, transcript editing, vocabulary, confirmed speaker identity, or Nebius feature yet. The original audio and database use owner-only file permissions. `.env`, `data/`, `.private/`, and generated local state are excluded from Git. The current model is English-only and requires native binaries/models on the device. Versioned cross-client contracts for planned resources are in [`contracts/v1.md`](../contracts/v1.md); planned endpoints must not be treated as implemented.

## Verification snapshot

The supplied 57:49 Otter ZIP imported through Chromium; its audio loaded, sought 10 seconds, and reopened after reload. Generated-audio integration tests cover valid import, range playback, duplicate retry, Otter-style ZIP, invalid files, job persistence, retry, transcript storage, and ambiguous speaker alignment. The full on-device pipeline completed in 515 seconds and displayed 789 segments in the browser; clicking a segment sought to its audio and highlighted the active text. Its 19 acoustic groups and 53.7% confident segment assignment require the speaker-quality follow-up in #29; see the [aggregate validation record](validation/real-interview-speech.md).
