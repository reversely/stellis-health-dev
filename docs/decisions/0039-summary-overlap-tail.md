# ADR 0039: Omit a non-substantive summary overlap tail

Status: accepted for development, 2026-10-16.

## Context

The real interview was split into twelve bounded parts with two passages of overlap. The twelfth part covered only the final 14.8 seconds. Its new material was a short request for follow-up and a blank-audio marker. Nemotron repeatedly turned it into a broader unsupported meeting claim, and local citation validation correctly rejected it. Eleven earlier parts already covered the interview through the start of that closing exchange.

## Decision

Before summary extraction, omit only a final overlapping part whose span is at most 30 seconds and whose passages absent from the previous part contain at most 15 concrete anchor words. Keep every earlier part and every substantive final part. This leaves a chronological point for each meaningful bounded part without forcing a claim from a few closing fragments. The transcript and audio remain complete; this rule only affects generated summary extraction.

The rule runs before reading saved checkpoints, so a run with eleven completed parts can resume synthesis without repeating provider calls when its twelfth part qualifies. If a later transcript edit changes the source revision, the normal AI identity creates a new run.

## Tradeoffs

The last few seconds may contain a small but important commitment with few concrete words. The rule uses duration, overlap, and word count rather than interpreting intent, and summaries remain reviewable against the complete transcript. A future model or user review can flag important short closings without weakening citation checks.
