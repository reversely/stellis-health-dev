# ADR 0031: Revisioned local meeting notes editor

Status: accepted, 2026-10-16. Implements #110 within #86.

## Decision

Use pinned Lexical 0.52.0 modules for a browser rich-text editor and convert its document to Markdown at the device API boundary. The editor supports headings, bullets, numbered lists, checklists, bold, italic, links, and undo/redo. Build the small entry point with pinned esbuild 0.28.2 and commit the output so a Python-only checkout can serve the UI. `npm ci && npm run build:notes` reproduces it.

Store each note as revisioned Markdown in device SQLite. A recording session owns a note while capture is active; finalization transfers ownership to the conversation in the same durable flow. A matching imported conversation with existing notes receives captured text as an appended section instead of losing either version. Writes use an expected revision and return conflict on a stale revision. Browser autosave also holds a local draft until the server acknowledges it; reload and interrupted-capture recovery offer the draft again. The notes are local plaintext on the device, subject to the same opt-in local login gate as conversations. They are not part of the encrypted account snapshot.

## Why this editor

The user required a FOSS visual editor and excluded Tiptap. Lexical offers the requested controls without an editor service. A native `contenteditable` implementation would require our own selection, history, list, and Markdown semantics. ProseMirror is viable but would add more integration code for this focused editor. Lexical's plugin and core packages in the lockfile are MIT. The transitive runtime packages bundled here are `lexical`, `@lexical/a11y`, `clipboard`, `code-core`, `dragon`, `extension`, `history`, `html`, `internal`, `link`, `list`, `markdown`, `rich-text`, `selection`, `text`, `utils`, and `@preact/signals-core`; every listed package declares MIT in `package-lock.json`. The build-only esbuild and its optional platform binaries also declare MIT. Third-party copyright notices are kept beside the bundle.

## Limits and next steps

The Markdown subset covers the visible toolbar and links; pasted images are outside #110. Simultaneous writes from two tabs use optimistic conflict detection and a draft-preserving retry, not collaborative editing. #111 adds separately versioned Nebius Enhanced Notes; #112 completes the wider Notes/Live transcript and AI workspace. This decision does not supersede Flutter for native clients.
