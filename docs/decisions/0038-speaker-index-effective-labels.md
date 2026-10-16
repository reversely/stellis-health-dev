# ADR 0038: Build the speaker index from effective transcript labels

Status: accepted, 2026-10-16.

## Context

The transcript API composes automatic cluster names, cluster and passage labels, and confirmed Person links into each passage's `speaker_display_name`. The browser rendered turn headings from that value but built the index from raw acoustic cluster IDs. A saved passage or Person name could therefore be visible on a turn and absent from the index. Otter's inspected interview displays the effective names with rounded speaking-time shares in its Speakers line; its storage and exact percentage formula are unknown.

## Decision

Use the transcript response's effective `speaker_display_name` for both turn headings and the index. Sum each named passage's saved start/end duration, divide by total named passage duration, and round to a whole percent. Exclude `Unknown speaker`. Recompute on every transcript fetch, including after tagging and ordinary page reload. The service remains the sole authority for label precedence; the browser does not reconstruct it from label tables.

This keeps local passage overrides and confirmed Person links visible without changing the underlying diarization clusters. Equal display names combine into one index entry. The index is a view of the active transcript generation, so candidate generations are not included until activated.

## Verification and limits

Database checks cover persisted cluster and passage labels and confirmed Person links, their projection through a fresh API client, and passage-label removal. In an isolated Chromium fixture, tagging a Person through the UI wrote two SQLite links and showed the name in both the turn and index after reload; Untag removed both links and restored the automatic name after reload. Chromium also showed the named people in the real interview index at desktop and 390px width. These percentages use saved passage spans, which may include short silence or overlapping speech; they are an approximate share of transcript time rather than measured voice activity.
