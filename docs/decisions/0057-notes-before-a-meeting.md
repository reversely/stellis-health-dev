# ADR 0057: Notes before a meeting

Status: accepted, 2026-10-17. Ticket #234.

## Context

The user asked to "add notes to a meeting before starting the recording" from Home's Coming up list. Notes have belonged to a recording session or a saved conversation, and neither exists before a meeting is recorded. [ADR 0050](0050-local-read-only-calendars.md) keeps no calendar event list on the device.

## Decision

- **Event notes are keyed by the provider's event ID.** A new `event_notes` table holds `provider`, `event_id`, Markdown, a revision, and the update time. It stores no title, time, attendee, or other event detail, so the device still keeps no event list.
- **Recording a meeting moves its notes.** `POST /api/v1/recordings` accepts `calendar_provider` and `calendar_event_id`. In the same transaction that creates the session, the event's notes become the session's My Notes and the event row is removed.
- **The same editor and save rules apply.** The browser uses the existing notes editor and revision checks; a stale revision returns 409.
- **The meetings list says which events have notes** through a `has_notes` flag, computed from the table on each request.

## Consequences

Notes for a meeting that is never recorded stay on the device until account deletion, which clears the table. A recurring meeting's notes follow the instance ID the provider returns, so each occurrence has its own notes. Disconnecting a calendar leaves its event notes in place, and they reappear if the same calendar is connected again.
