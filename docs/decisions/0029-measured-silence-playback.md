# ADR 0029: Measured silence for optional playback skipping

Status: implemented in ticket #95, 2026-10-16.

## Decision

A device job scans the original media with the installed FOSS ffmpeg `silencedetect` filter at -35 dB for at least 1.2 seconds. It trims 200 ms from each detected edge, removes any part that overlaps a timed transcript passage plus a 250 ms guard, and retains only gaps of at least 1.5 seconds. A versioned, idempotent job stores original-media millisecond intervals in SQLite. A transcript must exist before the scan can run.

The browser offers Skip Silence below speed controls, off by default. When enabled it requests the local scan, shows progress and the gap count, and seeks the existing audio element to the end of a measured gap during playback. Manual seeking remains possible. The player, transcript, words, highlights, and AI citations keep their original audio timestamps.

## Why this fork

Transcript gaps alone do not prove silence, and low audio energy alone can mistake a quiet speaker for silence. The first real-interview probe with only a loudness threshold found 374 candidate gaps totaling 1,507 seconds, including the first speaker's words. Requiring both measured low energy and no timed speech reduced the result to 17 gaps totaling 40 seconds on the 57:49 interview. This conservative intersection avoids skipping quiet recorded speech at the cost of leaving some true pauses audible.

## Limits

The threshold is fixed for this development version; very quiet non-speech content can still be skipped when it lies outside timed passages. If a transcript misses speech entirely, the guard cannot protect it. Model timing and audio-energy checks do not prove perfect speech preservation. The interval scan is local and changes playback only; it does not edit media or source anchors. Otter's switch state was observed live, but its exact skip threshold and detector were not established, so this is an explicit Stellis implementation choice.
