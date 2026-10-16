# ADR 0043: Images anchored to selected transcript words

Status: accepted, 2026-10-16.

## Context

In the signed-in Otter interview, selecting words exposes Add Image. Chrome reports that action as a native file chooser, with multiple selection enabled. The existing Stellis image flow saved an optional passage ID and audio time but no selected quote or offsets, so it could not tell whether the image still belonged beside the same words after an edit or a new ASR generation.

## Decision

The selected-text toolbar opens a native file chooser that accepts up to ten images. The existing preview and caption dialog confirms the batch, shows the first preview, and applies one caption to every chosen image. Each image is an individual upload transaction. The device API stores the source passage ID, exact quote, character offsets, and original audio time in the existing private `conversation_images` table. It validates the displayed text and transcript revision inside the same SQLite write transaction as each image record. The existing image validator strips metadata and stores normalized WebP bytes separately from SQLite.

The inline image card shows its selected quote. A changed excerpt displays **Source changed**; a passage absent from the current transcript displays **Earlier transcript**. During ASR reprocessing, a selected image is a review overlay. It moves only after an explicit decision to map it to a passage containing the quote exactly once. Its image ID and private file are retained. Unresolved images stay at their original audio time. A plain time or passage image keeps the existing behavior. Permanent conversation deletion removes the image row and file; Recently Deleted retains both until restore or purge.

Image bytes and quote metadata remain on the device and are omitted from Nemotron prompts and browser text snapshots. Cross-device image sync requires a later encrypted media contract.

The reference chooser accepts multiple files, but its result after selection was not observed. Stellis applies one caption to a batch and reports partial saves if a later file fails.

## Verification

API tests cover stale revision, exact displayed quote, persistence, invalid range without a file, explicit ASR remap, and ambiguous quote rejection. Chromium tested selection, native file choice, preview, save, reload, and private API projection on an isolated fixture. A batch of two files saved two exact-range image records. On the real 57:49 interview, the same flow saved an image at 0:00; a 390-pixel reload showed its inline quote card without horizontal overflow. All test images were deleted.
