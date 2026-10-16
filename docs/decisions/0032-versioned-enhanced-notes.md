# ADR 0032: Separate versioned Enhanced Notes runs

Status: accepted, 2026-10-16. Implements #111 within #86.

## Decision

Generate Enhanced Notes through Nebius Nemotron using the displayed transcript and a snapshot of My Notes. The browser starts the first run when a transcript-ready conversation first opens Notes. Reopening reuses that run; Refresh starts another version. Generation uses bounded transcript chunks, source-validated intermediate items, and a synthesis call that may prioritize raw-note topics only when the transcript supports them. A result has Overview, Topics, Decisions, and Action proposals, each with validated passage IDs and saved audio start times. The source buttons seek the original audio.

Store runs in a separate `enhanced_notes_runs` device SQLite table. Each run keeps transcript revision, speaker identity hash, raw-note revision and hash, model/prompt version, state, provider metadata, result, retained source times, and an independently revisioned editable Markdown copy. Earlier versions and edits remain available if sources change. A source change marks the old run stale; an interrupted run becomes a retryable failure on service startup. My Notes stays independent and is never overwritten by AI output. The edited copy is local plaintext behind the optional device login; only bounded transcript text, speaker names, and My Notes text go to Nebius. Audio remains local.

## Fork considered

Reusing the existing summary row would make a refresh or My Notes edit change the semantics of ordinary conversation summaries and their source dependencies. A separate run table preserves the already deployed summary and question flows and gives Enhanced Notes its own revisions and failure state. We reuse the existing bounded Nebius adapter and strict source validator; this avoids a second provider integration.

## Limits

Raw My Notes input is limited to 8,000 UTF-8 bytes per run, with an explicit error beyond that size. A source ID validates that the model cited supplied text, not that its claim is factually true. User edits do not rewrite the saved source citations; the Sources disclosure shows the original generated evidence. This is a development loopback implementation, not account sync or a native Flutter screen. Signed-in Granola editor behavior is still an open reference check in #86.
