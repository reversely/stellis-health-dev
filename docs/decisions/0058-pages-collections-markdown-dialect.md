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
