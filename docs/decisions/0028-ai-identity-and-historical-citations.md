# ADR 0028: Speaker identity as an AI source dependency

Status: implemented in ticket #93, 2026-10-16.

## Decision

An AI run records the transcript revision and a SHA-256 hash of the ordered source passage IDs, displayed speaker names, and confirmed Person IDs used for its Nemotron request. The request identity includes both values. A Person rename, merge, confirmation, unlink, or review remap that changes that projection marks earlier summaries and answers stale. Old results remain visible; the browser offers an explicit new summary action. A run whose projection changes before or during inference fails with a stale-source state instead of publishing as current.

Each new run also records source passage audio start times. For pre-migration runs, the API resolves cited IDs from retained transcript generations. A citation to an earlier generation seeks the original audio while the old AI result stays visible; the UI does not pretend that an obsolete passage is in the current transcript.

## Why this fork

Increasing the transcript revision for a Person rename would make unrelated optimistic transcript edits conflict across every conversation sharing that Person. The identity hash tracks the actual speaker projection sent to Nemotron, per conversation. It also distinguishes different confirmed Person IDs with identical display names. The hash does not leave the device; transcript excerpts and labels are sent to Nebius only when the user starts a run.

## Migration and limits

Earlier AI runs have no saved identity hash, so they are marked stale until regenerated. Their citation times can be recovered from retained generations. A source absent from all retained generations remains unavailable. Audio seeking verifies where a cited passage occurred, not whether a model-generated claim is true.
