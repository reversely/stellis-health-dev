# Real interview word-timing validation

Date: 2026-10-16. Source: the user's private 57:49 Otter export in ignored `data/`. No audio or interview wording is stored here.

The versioned on-device Whisper pass measured 8,220 words in 806 fresh passages. A separate job matched those word offsets into the pre-existing rematched transcript: 7,612 of 8,957 source words (85%) across 789 passages. Twelve passages had no safely matched word spans and still seek from their source passage start. All 789 passage IDs, texts, timestamps, and speaker assignments matched the pre-alignment generation exactly. The existing five supported acoustic groups and 108 unresolved passages remained in place.

Otter's signed-in transcript exposed individual audio offsets for 8,883 words. Matching identical normalized words in five separate time windows gave the following start-time differences. Otter is an independent, imperfect audio-derived reference; matching words can still be mispaired, and these numbers do not prove absolute alignment accuracy.

| Window | Matched words | Median absolute difference | 90th percentile absolute difference |
| --- | ---: | ---: | ---: |
| Opening | 191 | 0.25 s | 0.73 s |
| Names and numbers | 130 | 0.24 s | 0.54 s |
| Technical discussion | 100 | 0.21 s | 0.58 s |
| Middle | 113 | 0.16 s | 0.60 s |
| Late | 125 | 0.22 s | 0.58 s |

Chromium loaded 7,612 timed word spans in about one second. Clicking a word after eight minutes sought to 500.04 seconds and marked that word active during playback. At three early speaker changes, clicks on the final timed word before and first timed word after the boundary sought to distinct source positions on the correct speaker turns (4.71/5.88, 77.36/79.22, and 102.26/103.68 seconds). A browser-recorded 10.8-second sample confirmed timed-word clicking, scrub tracking, and a highlight selected across words that persisted and could be removed. A separate 50-second browser conversation used **Measure word timing** from the UI and gained 122 timed words without replacing its five source passages. The interview view had no horizontal overflow at 390 pixels. Word timing is withheld from a passage when the user edits its wording, so stale source offsets are not projected onto new text.
