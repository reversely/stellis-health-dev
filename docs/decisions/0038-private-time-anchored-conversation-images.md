# ADR 0038: Keep meeting images as private time-anchored records

Status: accepted for development, 2026-10-16.

## Context

A participant may paste a screenshot of a shared screen during recording or upload an image while reviewing a saved conversation. My Notes are revisioned Markdown, while transcript passage IDs can change after reprocessing. An embedded data URL would make notes revisions large and tie image retention to Markdown text. A passage ID alone would lose placement when a later speech generation changes its boundaries.

## Decision

Store each image in a separate `conversation_images` row owned by one active recording or conversation. Save its audio time and optional selected passage ID. During finalization, transfer the image to the resulting conversation and clamp its time to the finalized media duration. Render beside the selected passage while that ID exists; otherwise place it by original audio time near the current transcript. An image can exist before any transcript is ready.

Accept decoded PNG, JPEG, and WebP under bounded byte and pixel limits. Use the MIT-CMU licensed Pillow package to apply EXIF orientation and re-encode pixels as WebP without supplied metadata. Store files in the private device data directory with opaque UUID names and serve them only through owner-scoped local API routes. The browser may upload from a file picker or image clipboard item. The image never enters My Notes Markdown, transcript text, or Nebius requests.

Recently Deleted hides the conversation and its images through the same owner check. Restore makes them available again. Discard and permanent deletion remove image rows and files; startup removes incomplete or orphan image files.

## Consequences

Image time remains stable across transcript edits and reprocessing, while exact visual placement may move when transcript boundaries change. The selected passage ID is a placement hint, not a claim that the image has spoken-word timing. Captions are short local text. Only the normalized WebP is retained, so download does not reproduce the original file's format or metadata. The current transcript sync bridge sends encrypted text snapshots only; images remain on the recording device.
