# ADR 0012: Use native Whisper token timing for source words

Status: accepted, 2026-10-16 (#39).

## Context

The browser currently seeks to a transcript passage's measured start time. Otter's signed-in transcript exposes individually timed word spans and tracks them during playback. Stellis's installed `whisper-cli` already writes token offsets and token probabilities in `--output-json-full`, but the device service discarded them. Dividing a passage duration by its word count would invent timing.

## Decision

- Keep the existing on-device whisper.cpp inference and full JSON output. Group its audio-timed tokens into display words, retaining source character offsets, audio offsets, the lowest contributing token probability, and `whisper_cpp_token_v1` provenance. Publish word spans only where concatenated token text exactly reproduces the ASR passage. A zero-duration or out-of-order token yields no word span for that token; the passage remains playable from its segment offset.
- Version the speech pipeline when publishing word timing. A user correction changes the displayed wording, so its original word spans are withheld for that passage. Speaker rematch still copies timed source segments without retranscribing.
- Render timed words as selectable spans inside each source passage. Clicking a word seeks its measured start; playback marks its active word. Selection keeps the existing character-offset highlight contract. Auto-follow scrolls only while audio plays and after a quiet period following user wheel, touch, or keyboard input.
- Do not enable whisper.cpp VAD in this pipeline. Its CLI full-JSON token offsets have a [known original-timeline mapping problem with VAD](https://github.com/ggml-org/whisper.cpp/issues/4046). Segment-level seeking remains available when timing is absent or uncertain.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| Infer equal word durations from segment offsets | No audio measurement. Rejected. |
| Add a second forced-alignment model and runtime | May improve accuracy, but increases model size and processing time before this built-in timing has been measured on the interview. Revisit if reference comparison or browser replay shows drift. |
| Use native timed tokens from the existing ASR pass | No extra model or hosted audio transfer; shares the exact recognized wording. Native offsets may still be approximate, particularly at clipped boundaries, so provenance and conservative fallback remain visible. Selected. |

## Verification

A 17-second local clip produced 45 valid word spans across three ASR passages; final clipped zero-duration tokens were omitted. In a weak comparison with Otter's independently timed transcript, 41 matching words had 0.19-second median absolute start difference and 0.51-second 90th percentile difference. A browser-recorded 10.8-second sample reprocessed through the versioned pipeline produced 29 timed words. Chromium checks confirmed click-to-word seeking, scrub-to-active-word tracking, and selection/highlight/removal across word spans. Long-interview timing validation remains pending.
