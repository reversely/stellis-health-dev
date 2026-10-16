# Stellis

Stellis is a browser workspace for recordings, transcripts, speakers, and source-backed AI insights. The first implementation slice runs on macOS with local speech processing. The larger product direction is in [`plans/Personal_AI_Assistant_Implementation_Plan.md`](plans/Personal_AI_Assistant_Implementation_Plan.md); current delivery tickets are [#10–#18](https://github.com/reversely/stellis/issues).

The cross-app/browser direction is recorded in [ADR 0003](docs/decisions/0003-cross-client-architecture.md), with the [device API v1 contract](contracts/v1.md). The browser app is the primary acceptance surface. Flutter is required for the iOS app and the shared iOS/Android/desktop stretch; Flutter web is optional. The loopback service handles local media and native speech jobs; a separate encrypted sync service will connect devices later.

## Current state

The local browser app imports audio or an Otter ZIP, lists conversations, and replays recordings with seeking. Recording, transcript editing, diarization, and Nebius views are being built in the ordered tickets. The acceptance test runs through the browser on a real interview.

## Setup and run

Requires macOS, Python 3.12, [uv](https://docs.astral.sh/uv/), `ffmpeg`, and `whisper-cli`. On a Mac with Homebrew, the native tools can be installed with `brew install ffmpeg whisper.cpp`. The application binds to loopback only until authentication is implemented.

```sh
uv sync --locked
uv run --locked stellis doctor
uv run --locked stellis serve
```

Open <http://127.0.0.1:8765/>. `GET /api/health` should return `{"status":"ok","mode":"local","version":"0.1.0"}`. Use `--port` to select another loopback port.

Use **Import recording** or drag a file onto the home page. MP3, WAV, M4A, OGG, WebM, FLAC, and Otter ZIP exports containing one audio file are supported up to 1 GB. Imports are stored under `~/Library/Application Support/Stellis`; set `STELLIS_DATA_DIR` to use a different private local folder. Reimporting the same audio opens its existing conversation.

For local transcription work, set `STELLIS_WHISPER_MODEL` to a whisper.cpp GGML model file. The current spike uses `ggml-small.en.bin`; the [whisper.cpp model collection](https://huggingface.co/ggerganov/whisper.cpp) supplies model files. Speaker models and the setup command will be added with [#12](https://github.com/reversely/stellis/issues/12). The macOS sherpa-onnx runtime uses both `sherpa-onnx` and `sherpa-onnx-core` in the lockfile because the upstream source metadata can omit the core dependency.

## Private data

`.env`, `data/`, `.private/`, and generated environments are excluded from Git. The user-supplied interview ZIP and all extracted audio, transcripts, and model outputs stay local. Only selected transcript text will be sent to Nebius when an AI feature is explicitly run. Do not place real recordings or API keys in issues, PRs, logs, or tests.

## Verified environment

Initial setup was tested on macOS arm64 with Python 3.12.13 and uv 0.11.17. Run `uv sync --locked` and the commands above after a fresh checkout; platform-specific recording and speech behavior still needs the browser acceptance tests in the product tickets.
