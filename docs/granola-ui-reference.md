# Granola notes reference for #86

Observed 2026-10-16. Separate live browser evidence from documentation and design inference.

## Browser and supplied image

- `https://notes.granola.ai/` redirected this Chromium session to `https://www.granola.ai/`; no signed-in notes editor was available. The marketing page includes an animated `My notes` / `Enhanced` control, but the element was hidden in the inspected frame. This does not establish signed-in interaction, default selection, or save behavior.
- The user's `docs/refs/recordinginprogress.png` is an Otter recording screenshot: active Note view, blank transcript area, AI Chat suggestions and input, and a persistent bottom bar with microphone, English, Pause, elapsed time, and Stop. It is a layout reference, not evidence for Granola's editor.

## Published Granola guidance

- [Taking notes](https://docs.granola.ai/help-center/taking-notes/taking-notes-in-granola) describes a blank canvas with headings, lists, checkboxes, bold, italic, and images. These capabilities informed the scoped FOSS editor in #110; image insertion is a later gap.
- [AI enhanced notes](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes) describes generation after a call ends, use of transcript, raw notes, and calendar context, editable results, source inspection, return to raw notes, and regeneration. These are published claims, not observed signed-in browser states. The Stellis requirement in #86 is auto generation on first Notes visit when a transcript is ready, and this takes precedence over Granola's stated timing.

## Open reference check

A signed-in Granola workspace or user screenshots are still needed to compare the exact My Notes/Enhanced choice, editing, and alternate states. #86 remains open for that reference check and full browser acceptance. The #110 editor can be verified against its own browser acceptance without asserting Granola UI parity.
