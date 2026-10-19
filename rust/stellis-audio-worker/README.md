# Stellis live ASR worker

This is the local provisional recognizer for browser recordings. It uses sherpa-onnx 1.13.8: online Parakeet Unified 560 ms for partial words and offline Parakeet TDT v2 for completed utterances. Final transcripts still use the existing Whisper path.

Build on the recording device:

```sh
cd rust/stellis-audio-worker
cargo build --release --locked
```

Install the checksum-pinned models using Python 3.12:

```sh
python scripts/install_live_asr_models.py /path/to/private/models/live-asr
```

Set these service environment variables to the absolute paths of the built binary and extracted model folders:

- `STELLIS_AUDIO_WORKER`: `rust/stellis-audio-worker/target/release/stellis-audio-worker` (with `.exe` on Windows)
- `STELLIS_ONLINE_ASR_MODEL_DIR`: `sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-streaming-560ms`
- `STELLIS_PARAKEET_MODEL_DIR`: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8`

The installer requires at least 5 GiB free before downloading a missing model and removes staging files after verification. The worker accepts one JSON line per PCM block with base64 encoded 32-bit little-endian float samples at 16 kHz. It replies with new stable segments, current partial text and decoded media duration. The device service owns the worker process and restarts it from durable chunks after a service restart.

## Native capture development path

Build with `--features native-capture` to enable `stellis-audio-worker capture`. The command selects the default microphone and the default output loopback on Windows/macOS, or a `.monitor` input on PipeWire/PulseAudio Linux. It emits newline-delimited JSON frames with distinct `microphone` and `system` labels, a monotonic offset, sample rate, channel count, and base64 little-endian f32 PCM. Send a line on stdin or close stdin to stop. A bounded callback queue fails on overflow instead of silently dropping audio. This is a device-local capture interface; the browser recording API does not yet consume its frames.
