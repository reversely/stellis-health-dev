# ADR 0033: Live recording chat from a saved provisional transcript

Status: accepted, 2026-10-16. Implements #112 within #86.

## Decision

During browser recording, My Notes and Live transcript remain the two primary views. AI Chat is an adjacent pane on desktop and an explicit toggle on narrow screens. Switching views does not touch MediaRecorder. A Web Audio analyser reads the same microphone stream into a small canvas soundwave; the source is never routed to speakers or Nebius. Pause draws a flat line; Stop disconnects the analyser and closes its audio context.

The live agent accepts a question only after local whisper.cpp has written a provisional preview snapshot from saved recording chunks. At request time, the device copies at most 500 recent provisional segments into a revision-independent `recording_ai_runs` row. The existing Nebius Nemotron answer adapter chooses bounded evidence, validates source labels, and receives no audio. Its live prompt calls out possible speech-recognition errors and avoids confident proper-name claims from one unclear mention. The row saves the question, answer/failure, provider metadata, and original audio times. Chat remains readable after finalization through the recording session's conversation link, with audio source buttons. A service restart marks interrupted answers failed. Discard and permanent deletion remove the chat rows.

## Fork considered

Sending raw microphone audio to a hosted agent would violate the device-first boundary. Running the existing conversation answer route during capture would treat unstable provisional passages as final transcript IDs. A recording-scoped snapshot and separate run table preserve what the agent actually saw, while the eventual finalized transcript can have different wording and speaker turns. The browser labels these answers as based on the live transcript and keeps their saved audio times for later review.

## Limits

The live answer depends on provisional transcription and cannot answer before a preview exists. Its evidence time is an audio navigation anchor, not a final transcript citation. A model answer can still misinterpret provisional words; users can replay the saved audio. The conversation's existing finalized summary and question flow remains separate. The soundwave shows input amplitude, not a guarantee that every spoken word was captured or recognized.
