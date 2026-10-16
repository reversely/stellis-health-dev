# First local speech and provider spike

Date: 2026-10-16. Fixture: the user-supplied, uncommitted Otter interview ZIP in `data/`. Its MP3 is 3,469.104 seconds, mono, 16 kHz. The ZIP also contains an Otter transcript and summary; those are weak reference material only and are not used as generated ASR output.

## Local engines

| Run | Input | Wall time | Result |
|---|---:|---:|---|
| whisper.cpp `small.en` | First 150 seconds | 12.69 seconds including decode/setup | 30 timestamped ASR segments in JSON |
| sherpa-onnx pyannote segmentation int8 + NeMo TitaNet, clustering threshold 0.8 | First 150 seconds | 11.23 seconds | 25 speaker turns in 4 clusters |
| Same diarization, threshold 0.9 | First 150 seconds | 11.16 seconds | 25 turns in 3 clusters, but a likely merge of two reference speakers |
| Same diarization, threshold 1.0 | First 150 seconds | 11.84 seconds | 24 turns in 2 clusters |

The Otter export marks 93 turns across six numbered speakers for the full recording. In the first 150 seconds, it marks three numbered speakers. At threshold 0.8, the local output mostly separates these three, with one extra short cluster. Threshold 0.9 merges two reference speakers. This is only a preliminary weak-reference comparison: Otter's own labels have not been independently verified, and a full-recording score has not been run.

The whisper.cpp and sherpa-onnx outputs were generated from audio on this Mac. No cloud ASR was used. The `sherpa-onnx` wheel needed an explicit matching `sherpa-onnx-core` dependency under uv on macOS; that dependency is pinned in the project manifest and lockfile. The segmentation model archive includes an MIT license; model provenance and redistributed license requirements must be checked before shipping binaries.

## Nebius

The local `.env` contains a `NEBIUS_API_KEY`. An authenticated `GET /v1/models` returned HTTP 200 and listed `nvidia/Nemotron-3_5-Lightning`. No paid completion has been made yet. A real bounded completion, structured-output check, and source validation are acceptance work for issue #15.

## Remaining gates

- Complete the full-recording local ASR and diarization runs.
- Manually audit speaker turns, including short/overlapping sections.
- Validate browser import, recording, scrubbing, editing, speaker correction, and artifact links.
- Make real Nebius calls from browser actions and audit factual support.
