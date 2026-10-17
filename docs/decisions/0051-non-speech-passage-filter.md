# ADR 0051: Drop non-speech passages; do not add voice activity detection

Status: accepted for development, 2026-10-17 (#181).

## Context

Whisper writes text for non-speech audio. Across the 14 saved local conversations, 159 of 2,718 passages held only a bracketed tag: `(scissors snipping)` 124 times, `(inaudible)` or `[inaudible]` 23 times, `[BLANK_AUDIO]` 7 times, and `[Silence]`, `[laughter]`, and `[bell]` a few times. Most of the scissors tags sat in one ten-minute stretch of a 41-minute recording, where the decoder looped on the tag instead of writing speech.

## Evaluation

Each option was scored by how many output words also appear in the Otter reference export for the same audio. The export is a weak reference, so these figures compare options rather than measure accuracy. Decoding used whisper.cpp 1.9.1, `ggml-small.en`, and the saved vocabulary prompt.

On an 11-minute clip of the tag-heavy stretch, Silero VAD v6.2.0 removed every tag and matched 105 words, against 58 for current decoding. `--suppress-nst` with a vocabulary prompt wrote 964 words, of which 50 matched. `--max-context 0` removes the vocabulary prompt as well, because whisper.cpp builds the prompt only when `n_max_text_ctx > 0`.

Full recordings changed the result. Current decoding is shown with the tag filter applied:

| Recording | Current decoding | Silero VAD, threshold 0.5, 200 ms pad | Silero VAD, threshold 0.35, 500 ms pad, 2 s merge |
| --- | --- | --- | --- |
| 40.9 min | 2,872 matched, 138 s | 2,697 (−6.1%), 102 s | 2,792 (−2.8%), 123 s |
| 57.8 min | 8,229 matched, 291 s | 8,213 (−0.2%), 332 s | 8,229, 339 s |

On the 40.9-minute recording, 25% of the saved measured word times fell outside the VAD speech intervals at threshold 0.5. The looser setting matched current decoding on the 57.8-minute recording only because it merged the whole recording into one interval.

`whisper-cli --vad` also leaves token times on its shortened timeline in 1.9.1: `whisper_full_get_token_data` returns them unmapped, while passage times are mapped back. On the tag-heavy clip, all 22 passages had token times outside their passage.

## Decision

- Keep current Whisper decoding and add no model.
- After decoding, drop any passage whose text contains only bracketed or starred tags, music marks, or punctuation (`processing.is_non_speech`). A tag inside spoken text stays.
- If a recording has only such passages, the job succeeds with no passages, and the transcript status reads "No speech detected". If Whisper returns no passages at all, the existing error remains, because the short-clip vocabulary fallback depends on it.
- The pipeline version moves to `…-words-v5`. Reprocessing removes tag passages from older transcripts, and the existing generation review stages that change when user edits depend on those passages.

## Tradeoffs

Where Whisper loops on a tag, the speech underneath stays missing; the filter removes the tag but does not recover the words. On the 40.9-minute recording, current decoding still recovered more matched words overall than either VAD setting. A future VAD or decoder change should be measured on full recordings against current decoding, not on clips.
