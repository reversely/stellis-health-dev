# ADR 0040: Keep meeting images as private time-anchored records

Status: accepted for development, 2026-10-16.

## Context

A participant may paste a screenshot of a shared screen during recording or upload an image while reviewing a saved conversation. My Notes are revisioned Markdown, while transcript passage IDs can change after reprocessing. An embedded data URL would make notes revisions large and tie image retention to Markdown text. A passage ID alone would lose placement when a later speech generation changes its boundaries. The original #131 implementation displayed attachments outside the note; #136 adds inline placement after user feedback. This ADR was renumbered because the summary work also used 0039.

## Decision

Store each image in a separate `conversation_images` row owned by one active recording or conversation. Save its audio time and optional selected passage ID. During finalization, transfer the image to the resulting conversation and clamp its time to the finalized media duration. Render beside the selected passage while that ID exists; otherwise place it by original audio time near the current transcript. An image can exist before any transcript is ready.

Accept decoded PNG, JPEG, and WebP under bounded byte and pixel limits. Use the MIT-CMU licensed Pillow package to apply EXIF orientation and re-encode pixels as WebP without supplied metadata. Store files in the private device data directory with opaque UUID names and serve them only through owner-scoped local API routes. The browser may upload from a file picker or image clipboard item. My Notes can contain an opaque Markdown reference, `![caption](stellis-image:<uuid>)`, rendered as an inline image block by its Lexical editor. The file bytes never enter Markdown, transcript text, or Nebius requests; Enhanced Notes replaces these local reference IDs with a generic image marker before sending note text.

My Notes tables use a Markdown pipe-table subset. The Lexical table plugin edits cells and row/column structure; the document serializes plain cell text into portable Markdown and rebuilds it on reload. This adds the MIT licensed `@lexical/table` and `@lexical/utils` packages to the existing Lexical bundle. The lockfile audit found no non-MIT JavaScript packages. Image upload saves to the private attachment API first, then inserts the reference in the local note; autosave and browser draft recovery protect the reference. Deleting a referenced image through the conversation card saves removal of its note reference before deleting the file.

Recently Deleted hides the conversation and its images through the same owner check. Restore makes them available again. Discard and permanent deletion remove image rows and files; startup removes incomplete or orphan image files.

## Consequences

Image time remains stable across transcript edits and reprocessing, while exact transcript placement may move when boundaries change. The selected passage ID is a placement hint, not a claim that the image has spoken-word timing. Captions are short local text. Only the normalized WebP is retained, so download does not reproduce the original file's format or metadata. The current transcript sync bridge sends encrypted text snapshots only; images remain on the recording device. Table cells currently serialize plain text; rich styling inside a cell does not survive Markdown round-trip. This is a documented limit of the portable table subset.

## Amendment, 2026-10-18: animated GIF and animated WebP

Notes support GIFs (#290, part of #260), so an upload that Pillow reports as animated is no longer rejected. Every frame is decoded to validate it. Limits: the existing 12 MB upload size, 8192-pixel side, and 20 MP per frame, plus at most 300 frames and at most 60 million decoded pixels in total (frames x width x height). The total bounds decode memory; 300 frames of 450 x 450 fit. Stills are unchanged.

An animated WebP is stored as uploaded. An animated GIF is also encoded as lossless animated WebP with its frame durations and loop count, and the WebP replaces the GIF only when it is smaller. The row's `media_type` is `image/webp` or `image/gif` and the file extension follows it; the file route serves that type. A single-frame GIF is still rejected. An animation is stored byte for byte unless the WebP re-encode wins, so metadata inside an animated WebP or a GIF comment block is not stripped, unlike stills. The editor shows the animation through the existing image block; that display is a frontend change tracked separately.
