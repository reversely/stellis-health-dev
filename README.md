# Stellis

Stellis is a browser workspace for recordings, transcripts, speakers, and source-backed AI insights. The first implementation slice runs on macOS with local speech processing. The larger product direction is in [`plans/Personal_AI_Assistant_Implementation_Plan.md`](plans/Personal_AI_Assistant_Implementation_Plan.md); current delivery tickets are [#10–#18](https://github.com/reversely/stellis/issues).

The cross-app/browser direction is recorded in [ADR 0003](docs/decisions/0003-cross-client-architecture.md), with the [device API v1 contract](contracts/v1.md). The browser app is the primary acceptance surface. Flutter is required for the iOS app and the shared iOS/Android/desktop stretch; Flutter web is optional. The loopback service handles local media and native speech jobs; a separate encrypted sync service will connect devices later.

## Current state

The local browser app imports audio or an Otter ZIP, records from the microphone, lists conversations, replays recordings, and runs on-device English transcription and acoustic speaker grouping. The transcript supports segment seeking, selected highlights, word corrections, vocabulary hints, and reversible speaker labels. The Summary & AI tab requests source-linked summaries and answers from Nemotron through Nebius. The acceptance test runs through the browser on a real interview. The [current architecture](docs/current-architecture.md) describes only running components.

## Setup and run

Requires macOS, Python 3.12, [uv](https://docs.astral.sh/uv/), `ffmpeg`, and `whisper-cli`. On a Mac with Homebrew, the native tools can be installed with `brew install ffmpeg whisper.cpp`. The application binds to loopback only until authentication is implemented.

```sh
uv sync --locked
uv run --locked stellis doctor
uv run --locked stellis serve
```

Open <http://127.0.0.1:8765/>. `GET /api/health` should return `{"status":"ok","mode":"local","version":"0.1.0"}`. Use `--port` to select another loopback port.

Use **Import recording** or drag a file onto the home page. MP3, WAV, M4A, OGG, WebM, FLAC, and Otter ZIP exports containing one audio file are supported up to 1 GB. Imports are stored under `~/Library/Application Support/Stellis`; set `STELLIS_DATA_DIR` to use a different private local folder. Reimporting the same audio opens its existing conversation.

For on-device transcription and speaker grouping, run `scripts/setup_models.sh` once, then restart `stellis serve`. The script downloads and verifies a whisper.cpp English small model and two sherpa-onnx speaker models into the private local model directory. `uv run --locked stellis doctor` reports whether all three files and native tools are present. The `STELLIS_WHISPER_MODEL`, `STELLIS_SEGMENTATION_MODEL`, and `STELLIS_EMBEDDING_MODEL` environment variables override individual model locations. Current output is English-only and has segment-level timing. The macOS sherpa-onnx runtime uses both `sherpa-onnx` and `sherpa-onnx-core` in the lockfile because the upstream source metadata can omit the core dependency.

In a transcript, click a passage to play from its timestamp, drag within a passage to highlight or copy an excerpt, or use the fixed player to scrub. Edit words from a passage's action, click a speaker name to label its whole acoustic group or just that passage, and open Vocabulary to add names or technical terms for the next local processing run. Corrections and highlights are stored locally. Word-level seeking and more readable combined turns are tracked in [#39](https://github.com/reversely/stellis/issues/39) and [#38](https://github.com/reversely/stellis/issues/38).

Press **Record** to grant microphone access and capture locally. Pause/resume and Stop and save appear during capture. Chunks are saved to the loopback service as they arrive; if the tab closes, the next visit offers **Recover and save** for acknowledged chunks. A recovered recording may end before the interrupted moment. The finished media uses the same import and transcription workflow as an uploaded file.

For summaries and questions, set `NEBIUS_API_KEY` in the environment or an ignored `.env` file, then open **Summary & AI** on a processed conversation. Press **Generate summary** or ask a question. These actions send bounded transcript excerpts and displayed speaker labels to Nebius; source links seek to the cited audio. Existing results remain visible after edits with a stale notice until regenerated. Provider request IDs, model, prompt version, and token usage are saved locally with each run.

## Private data

`.env`, `data/`, `.private/`, and generated environments are excluded from Git. The user-supplied interview ZIP and extracted audio stay local. On a user-triggered AI run, bounded transcript excerpts and displayed speaker labels are sent to Nebius. AI results and provider metadata are stored locally. Do not place real recordings or API keys in issues, PRs, logs, or tests.

## Verified environment

Initial setup was tested on macOS arm64 with Python 3.12.13 and uv 0.11.17. Run `uv sync --locked` and the commands above after a fresh checkout; platform-specific recording and speech behavior still needs the browser acceptance tests in the product tickets.
