# ADR 0061: Incremental local ASR for recording previews

Status: implementing in ticket #345, 2026-10-19. Supersedes ADR 0030's preview recognizer and polling cadence; ADR 0006's durable chunk source remains.

## Observed sources

- The [sherpa-onnx Rust examples index](https://github.com/k2-fsa/sherpa-onnx/blob/master/rust-api-examples/README.md) lists Nemo Parakeet as a non-streaming recognizer. Its [Parakeet microphone example](https://github.com/k2-fsa/sherpa-onnx/blob/master/rust-api-examples/examples/parakeet_tdt_simulate_streaming_microphone.rs) uses voice activity detection and repeated offline decoding to simulate streaming. The [Zipformer example](https://github.com/k2-fsa/sherpa-onnx/blob/master/rust-api-examples/examples/streaming_zipformer.rs) uses the online recognizer API for actual partial results.
- On GN100, sherpa-onnx 1.13.8's Rust API produced partial text from 0.5-second PCM increments and a Parakeet utterance at the end of the same 7.4-second sample. A saved WebM fixture fed through one persistent ffmpeg decoder showed partial words before the remaining bytes were sent. Those tests establish the Linux path, not Windows or macOS capture.
- On GN100, the isolated app accepted seven one-second MediaRecorder chunks from Firefox's fake microphone. The saved preview reached `ready` through chunk 6 and the browser showed “No speech yet,” as expected for the synthetic tone. A separate 7.4-second WebM speech fixture produced a final preview segment through the same preview code. Physical microphone capture and the Windows and macOS workers still need verification.

## Decision

The browser still saves recoverable MediaRecorder chunks under ADR 0006. The device verifies each new chunk's sequence, size and digest before writing it to one ffmpeg decoder for that recording. ffmpeg converts the growing stream to mono 16 kHz PCM. A Rust worker using `sherpa-onnx` 1.13.8 consumes those samples incrementally. An online Zipformer supplies words during speech; offline Parakeet replaces an utterance after an online endpoint. The preview remains provisional, privately saved with audio times, and available after reload. A server restart replays the saved chunks into new processes. Finalization still imports the verified recording and uses Whisper for the final transcript until vocabulary hints are supported on the new path.

The browser asks for a preview after three saved chunks and then every two chunks. The worker and decoder persist across those requests. Finalize and discard stop both processes and remove the provisional snapshot. Model downloads are checksum pinned and kept in the user's local model directory; audio is not sent to a speech service.

## Limits

Two local models increase installation size. Parakeet is offline at utterance boundaries, so a long uninterrupted turn can show Zipformer wording until a pause. The current worker receives decoded PCM from ffmpeg; native microphone and system capture with cpal is ticket #344. Three-platform build checks and physical recording tests are required before #345 closes. Speaker identities and word anchors remain part of final processing, not the provisional transcript.
