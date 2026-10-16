# ADR 0034: Guard short-clip vocabulary prompting with an unprompted decode

Status: accepted, 2026-10-16.

## Context

The local Whisper initial prompt makes saved vocabulary available to ASR, but it can also suppress audible speech. A 25.319-second browser recording of the private interview produced `-` at 0–2.62 seconds and its next text only at 15.8 seconds with the saved prompt `Vocabulary: CFAR, CubeSat, Shereen`. Direct whisper.cpp on the identical decoded recording without that prompt recovered five segments beginning at 0 seconds. The two decodes covered 38.6% and 91.3% of diarized speech time, respectively. The captured WebM contained speech, so the loss was in prompted decoding rather than upload or remux. The private recording remains local; `tests/fixtures/jfk.wav` supplies a separate public real-speech smoke fixture.

## Decision

Keep the vocabulary snapshot and initial prompt. For clips no longer than 60 seconds with vocabulary, also decode once without a prompt. Compare lexical segment time against the local diarization turns, ignoring punctuation-only and bracketed non-speech results. Select the unprompted result only when it covers at least 65% of turn time and exceeds the prompted result by at least 20 percentage points. If prompted decoding returns no segments, use the unprompted result. Store the chosen segments and fallback/coverage metrics under pipeline version v2; preserve the captured media and transcript generation history.

## Consequences

- Short prompted jobs run a second local Whisper pass; the reproduced 25-second job took 5.67 seconds and selected the unprompted candidate at 91.3% coverage.
- Vocabulary still guides results when it does not materially reduce speech coverage. The guard favors recovering audible words over preserving a name spelling from a prompt.
- Turn coverage is a proxy for missing speech, not a word-accuracy score. It cannot prove the spelling of terms, and it does not protect clips longer than 60 seconds. Longer-clip prompting and diarization quality remain separate evaluation work.
