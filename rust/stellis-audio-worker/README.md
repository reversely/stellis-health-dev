# Stellis live ASR worker

This is the local provisional recognizer for browser recordings. It uses sherpa-onnx 1.13.8: online Zipformer for partial words and offline Nemo Parakeet for completed utterances. Final transcripts still use the existing Whisper path. The online loader also accepts the `encoder.int8.onnx`, `decoder.int8.onnx`, and `joiner.int8.onnx` names used by sherpa-onnx Nemotron Speech Streaming; selecting that model requires a separate verified model installation and service configuration.

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
- `STELLIS_ONLINE_ASR_MODEL_DIR`: `sherpa-onnx-streaming-zipformer-en-2023-06-21`
- `STELLIS_PARAKEET_MODEL_DIR`: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8`

The installer requires at least 5 GiB free before downloading either missing model and removes its temporary archive after extraction. The worker accepts one JSON line per PCM block with base64 encoded 32-bit little-endian float samples at 16 kHz. It replies with new stable segments, current partial text and decoded media duration. The device service owns the worker process and restarts it from durable chunks after a service restart.
