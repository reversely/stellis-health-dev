# ADR 0052: Notebooks, capture-time ordering, and account deletion

Status: accepted for development, 2026-10-17.

## Context

The user sketched a home page with a rail of recent conversations, a grid of project notebooks, and an Account settings entry. The user asked for the recent list "in strict reverse" order and for settings covering name, username and password, email, integrations, custom vocabulary, and account deletion. Existing categories are many-to-many labels seeded as Meeting, Event, Interview, and Conversation; [ADR 0046](0046-conversation-organization-controls.md) keeps them from implying folder semantics.

## Decision

- **Notebooks are a new entity.** A conversation belongs to at most one notebook through `conversations.notebook_id`. Categories stay as labels. The user chose this over reusing categories.
- **Notebook colours** come from the user's five-colour palette. A new notebook takes the next colour in order unless one is chosen.
- **Progress points** come from the newest conversation's existing Summary: decisions and action proposals, else topics, at most three. The user's Summary edits take precedence over the generated result. No new AI call is made. The user chose this over a cross-meeting summary.
- **Capture time** is `conversations.recorded_at`. A browser recording stores its session start. An import stores the file's last-modified time sent by the browser. Imports from before this change, or with an implausible time, have no capture time and sort by import time.
- **Account deletion removes all local data.** It requires the password and the typed word DELETE, refuses while processing runs, and reuses permanent deletion for each conversation. The user chose this over removing only the sign-in.
- **Calendar connections in Settings** use the existing `/api/v1/calendar/*` API from [ADR 0050](0050-local-read-only-calendars.md). A `return_to` parameter returns the callback to Settings.

## Consequences

A browser's last-modified time can be the download time instead of the capture time, so imported files may sort by when they were saved. Deleting an account cannot be undone and leaves no Recently Deleted copy. The shared dev login has no account settings.
