# ADR 0004: On-device speech and speaker pipeline

Status: accepted for ticket #12 after full-interview processing; speaker-quality follow-up #29 remains open. Date: 2026-10-16.

## Decision

A durable job on the local device decodes the original media with ffmpeg to mono 16 kHz PCM, runs whisper.cpp with the pinned English small model, and runs sherpa-onnx offline diarization with Pyannote Segmentation 3.0 int8 plus NeMo TitaNet small embeddings. The app stores model-generated timestamped segments and acoustic turns in SQLite, aligns each text segment by overlap, and serves both to the browser. No Otter transcript text enters the processing path.

## Library fork

| Option | Assessment |
| --- | --- |
| whisper.cpp CLI | Mature local native runtime, already installed and measured on the target Mac. JSON output provides segment timestamps. Selected for this slice; pin model digest and record pipeline version. |
| faster-whisper / CTranslate2 | Useful potential desktop alternative, but adds another runtime and model format without solving speaker labeling; benchmark later if accuracy or speed is inadequate. |
| Whisper WebAssembly only | Would remove the companion process but has unmeasured model memory and long-recording performance in browser/mobile. Keep as an optional later adapter. |
| sherpa-onnx diarization | ONNX-native segmentation and embedding/clustering API with Python bindings, and prior 150-second sample spike succeeded. Selected. |
| Pyannote Python pipeline | Strong research ecosystem, but a larger PyTorch stack and model access/licensing integration for the first packaged worker. Revisit if speaker accuracy fails the gate. |
| Nemotron for speaker assignment | Text cannot establish acoustic speaker identity. Nemotron is reserved for summaries and text features. |

The current threshold `0.8` favored separating the two known early voices in the sample; it is a heuristic, not calibrated speaker confidence. A tiny extra cluster appeared in the sample. The UI therefore shows anonymous speaker groups and flags short or poorly covered text segments for review. Future rematching should allow the user to confirm identities and protect manual labels. Word timings are left empty because this whisper output only supplies segment offsets; ticket #13 must not invent word timestamps.

## Job and failure behavior

A conversation/pipeline-version pair has one job. State, stage, progress, errors, and aggregate metrics are saved in SQLite. A queue launches one isolated Python process at a time for native processing; this prevents ONNX inference from blocking HTTP polling. A per-job file lock prevents duplicate work after a service restart. Unfinished jobs are requeued on startup. A failed job can retry without replacing source audio. A new model bundle or algorithm requires a new pipeline version. The browser polls the job resource and exposes states and transcript segments.

The current `transcribing` progress is a stage marker, not a true percent from whisper-cli. Diarization progress uses processed chunks. A hard process kill may recompute a stage from the source; source audio survives. Temporary decoded PCM and model output are removed after each attempt.

## Model distribution and privacy

`scripts/setup_models.sh` downloads pinned files into the private local model directory and verifies SHA-256. Model files are not committed. The English small model advertises English only. Native subprocess output is suppressed so a transcript or local path does not enter logs. Speech processing makes no Nebius or other network call; the setup script is the only model download path. Source text sent to Nebius in #15 will be a separate explicit operation.

## Real-interview result

The full interview produced a usable English transcript and provisional acoustic clusters, but only 53.7% of segments had confident overlap assignment and 19 clusters overfragmented six Otter reference voices. See [the aggregate validation record](../validation/real-interview-speech.md). The final autonomous speaker-labeling criterion remains open in #29.
