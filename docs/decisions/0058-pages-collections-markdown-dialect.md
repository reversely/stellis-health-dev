# ADR 0058: Pages, collections, and the stored Markdown dialect

Status: accepted for development, 2026-10-18.

## Context

The user asked for Markdown pages and notebook organisation modelled on Notion, augmented by meeting notes. The research is in [the Notion UI reference](../notion-ui-reference.md). Every conversation requires audio (`conversations.audio_filename`, `source_sha256`, and `duration_ms > 0`), notes exist only for a recording, a conversation, or a calendar event ([ADR 0031](0031-revisioned-meeting-notes-editor.md), [ADR 0057](0057-notes-before-a-meeting.md)), and notebooks are flat ([ADR 0052](0052-notebooks-capture-time-and-account-deletion.md)).

## Decision

- **Pages are a new entity.** A page is a title and revisioned Markdown with no audio. It belongs to at most one notebook through `pages.notebook_id`; a page with no notebook appears under No notebook, as conversations do. Pages use the same expected-revision writes and 200,000-byte limit as notes, go to Recently Deleted, take tags, and are found by search. The user chose a new entity over allowing conversations without audio.
- **Collections group notebooks.** A notebook belongs to at most one collection through `notebooks.collection_id`. Collections do not nest, and a notebook may belong to none.
- **The database stays the source of truth.** Pages, notes, and notebooks remain rows in device SQLite. A Markdown folder export (collection, notebook, page) is planned. The user chose this over a live folder of files.
- **Blocks beyond GFM use GitHub and Obsidian syntax where it exists.** Callouts are `> [!type] Title` blockquotes. Toggles are `<details><summary>`. Videos use image syntax with the video URL, `![caption](url)`. Link cards are `<bookmark url="...">caption</bookmark>` and columns are `<columns><column>`, both taken from Notion-flavored Markdown because neither GitHub nor Obsidian defines them. The user chose this mix over adopting Notion's tags throughout.
- **Link cards may contact the linked site.** The device service fetches a page's title, description, and preview image and caches them; the browser loads the preview image itself. The user accepted outbound requests for embeds.
- **Page images are a separate table** that reuses the meeting image pipeline and the `stellis-image:` reference, so `conversation_images` and its owner constraint stay unchanged.

## Consequences

Pages are local plaintext like notes and are not part of the encrypted account snapshot until a later decision covers notes and pages together. The stored dialect renders outside Stellis only where GitHub or Obsidian support it; link cards and columns show as tags elsewhere. Agent-written changes to databases, such as new to-do rows or tentative status changes, are a separate later decision and are not pages.

## Amendment, 2026-10-18: Markdown folder export (#284)

The user decided on two export options: **Export Markdown** (plain, for other tools) and **Export for Stellis** (keeps task IDs and dialect tags for a later re-import). The backend ships first; the menu action is a separate frontend ticket.

### Contract

`GET /api/v1/export?scope=collection|notebook|all&id=<id>&format=markdown|stellis` returns `application/zip`. `scope` defaults to `all` and `format` to `markdown`. `id` is required for `collection` and `notebook` (400 without it, 404 for an unknown ID); `all` ignores it. An invalid `scope` or `format` is 422.

- **Included:** active pages and conversations (not trashed) in scope. Recordings in progress, transcripts, and audio are not exported.
- **Layout:** `<collection>/<notebook>/<title>.md` for a notebook in a collection, `<notebook>/<title>.md` for a notebook without one, and `No notebook/<title>.md` for items without a notebook (scope `all` only). Each notebook folder holds its own `images/` folder with `<image id>.<ext>` files.
- **Pages:** `# <title>` followed by the page Markdown.
- **Conversations:** one file with `# <title>`, `## My Notes`, and `## Summary`. The Summary is the latest finished version, the user's edited text when it exists and otherwise the generated points under `### Overview`, `### Topics`, `### Decisions`, and `### Action proposals`. A section with no content reads `_No notes._` or `_No summary._`.
- **`format=markdown`:** `todos.plain_markdown` strips task IDs, turns bookmarks into links, and unwraps columns; `stellis-image:` references become `images/<id>.<ext>`. A reference whose file is missing becomes its alt text.
- **`format=stellis`:** page and note text is stored Markdown verbatim, so IDs, dialect tags, and `stellis-image:<id>` references stay. The same `images/` files are included, and `stellis-export.json` at the ZIP root maps them. The manifest has `version` (1), `format`, `scope`, `scope_id`, `exported_at`, `layout` (`title-heading`: strip the first `# ` line, and for a conversation split at the two `##` headings), `collections` and `notebooks` (ID, name, color, folder, membership), and `items` (kind, ID, title, path, notebook ID, tags as ID and name, note or page revision, created time, referenced images as ID and path, and for a conversation the Summary version ID).
- **Names:** characters that are unsafe in a path (separators, `:*?"<>|`, control characters) become spaces, leading and trailing dots and spaces are removed, names are cut to 100 characters, an empty name is `Untitled`, and a duplicate in the same folder (ignoring case) gets ` (2)`, ` (3)`.
- **Resources:** the ZIP is built in a temporary file in the data directory and deleted after the response is sent or if building fails. Images are streamed from disk.
