# ADR 0037: Complete cited summary points

Status: accepted for development (2026-10-16)

## Context

The 57:49 interview's Nemotron summary retained chronological coverage, but five of eleven overview points were exactly 280 characters and several ended mid-phrase. The provider JSON schema capped every item at 280 characters while local validation permitted 1,000. The first point also claimed an interview affiliation and subject that its three cited opening passages did not establish. Valid passage IDs prove only that a citation exists.

## Decision

Allow up to 1,000 characters in the provider item schema, then locally require overview points to be complete punctuated sentences of at most 400 characters. Prompt Nemotron to keep each point to one concrete claim from at most three nearby passages. For each chunk overview, compare concrete words in its claim with its own cited passage text and displayed speaker names. A point with less than 45% word coverage is returned for one correction that asks the model to remove unsupported details or choose closer passages. If the corrected response still fails, fail the run without publishing a partial result. Keep the existing bounded chunk extraction, chronological anchor per chunk, and source IDs. Bump the prompt version so new runs can be distinguished from older output.

Citation IDs, audio seeks, and word overlap are structural cues, not a semantic fact check. The overlap rule can miss a false claim using the same words as a source, and can reject a valid paraphrase. Audit sampled claims against cited transcript and audio during real-interview validation. Do not label the results as verified merely because the guard passes. A later semantic review feature may add explicit claim-level review if real runs still show unsupported claims.

## Tradeoffs

The schema no longer pressures the model to truncate at 280 characters. The completeness or citation cue can cause one additional billed request per failed chunk; a second failure leaves the previous successful summary available. The cue is applied to chunk overviews, not synthesis topics or AI answers. Sentence-final punctuation is a cheap completeness guard, not proof of grammatical completion or factual support. Manual source review remains necessary for acceptance.
