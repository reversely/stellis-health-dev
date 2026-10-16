# First implementation slice: local interview intelligence

Status: design decision for the first runnable slice, 2026-10-16. The broader `plans/Personal_AI_Assistant_Implementation_Plan.md` remains a product reference, not a claim that all platforms or sync are implemented.

## Acceptance target

From the browser, import or record an interview; decode, transcribe, and diarize its audio on the user's Mac; assign stable anonymous speaker IDs from acoustic evidence; replay and scrub audio against an editable transcript; correct speaker assignments and vocabulary; generate a source-backed summary and additional structured insights through a real Nebius Nemotron API call; then inspect the evidence in the same browser interface. The interview ZIP in `data/` is a private test fixture and is never committed.

The first release does not equate an anonymous speaker cluster with a real person's identity. Named automatic recognition requires confirmed enrollment samples and a separate false-identification evaluation.

## Stack decision

Use a Python 3.12 local application with a browser UI for the first macOS slice. The browser owns import/record controls, playback, transcript scrubbing/editing, speaker review, vocabulary, and insight views. Python orchestrates the installed `whisper-cli` and `sherpa-onnx` native runtime; the speech models execute on this machine. A loopback HTTP server serves the UI and a SQLite database. The Nebius adapter is the only hosted inference path. This differs from the plan's proposed Flutter-first client because the workstation already has a working whisper.cpp binary and model, while no Flutter SDK is installed. The local pipeline can be measured against the 57-minute interview before adding mobile capture or a shared client framework.

## Boundaries

| Component | Responsibility | Data boundary |
|---|---|---|
| Importer | Read audio files and Otter ZIP; normalize to mono 16 kHz PCM | Local only |
| ASR adapter | Run `whisper-cli` with an explicit local model; parse timestamped JSON | Local only |
| Diarization adapter | Run sherpa-onnx segmentation and embedding/clustering models | Local only |
| Alignment | Assign speaker clusters to ASR segments by temporal overlap; retain uncertain/unmatched states | Local only |
| Repository | Store recordings, transcript revisions, speaker turns, and generated artifacts in SQLite | Local only |
| Nebius adapter | Send selected transcript text and segment IDs to `nvidia/Nemotron-3_5-Lightning`; validate returned source IDs | Transcript text crosses to Nebius only on an explicit generation action |
| Browser UI | Import/record, replay/scrub, edit words and vocabulary, assign speakers, inspect summary/decisions/topics/tasks, open source timestamps | Loopback server only until auth is implemented |

## Initial data contracts

- `Conversation`: ID, title, source filename, duration, created/imported time, processing state.
- `TranscriptSegment`: ID, start/end milliseconds, text, ASR model, speaker cluster ID or unknown, revision.
- `SpeakerTurn`: start/end milliseconds, acoustic cluster ID, model identity, confidence or uncertainty metadata where available.
- `DerivedArtifact`: kind, source revision hash, model ID, prompt version, structured content, validated source segment IDs, request ID and usage metadata.

All generated artifacts retain the model and input revision identity. A changed transcript invalidates derived artifacts. The Nebius adapter never receives raw audio. API keys stay in `.env` locally and are excluded from logs and Git.

## Evaluation gate

1. Run a short audio slice through whisper.cpp and sherpa-onnx; inspect latency and failure modes.
2. Run the full interview. Report duration, ASR real-time factor, number of diarized turns/clusters, and alignment coverage.
3. Compare speaker turns with the Otter export as a *weak reference*. Otter's labels may be wrong; manually audit representative clean, short, overlapping, and noisy turns before claiming success.
4. Make a real Nebius request with a bounded transcript excerpt first, then full evidence-window/chunked processing. Reject invented source IDs and unsupported claims.
5. Verify the browser UI supports import/record, audio playback and scrubbing, transcript navigation/editing, speaker correction, vocabulary, source opening, and artifact inspection from a fresh process.

Login and authenticated sessions precede any remote multi-user deployment. End-to-end encryption and sync are separately evaluated stretch capabilities after the local browser workflow is working.

No ticket is closed merely because a control renders or a model returns text. Reliability claims require recorded evaluation results on the real interview and more samples when speaker recognition is enabled.
