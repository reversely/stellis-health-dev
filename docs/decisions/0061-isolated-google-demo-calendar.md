# ADR 0061: Isolated Google demo calendar

Status: Accepted for the RFI 91 demo, 2026-10-19.

## Context

Stellis reads the connected account's primary Google calendar with `calendar.events.readonly`. Ticket #364 asks for a new calendar containing fictional RFI 91 events that appear in Stellis. The existing grant cannot create a calendar or events, and the current reader only requests `primary`.

Google documents `calendar.app.created` as permission to create secondary calendars and read and edit events on calendars created by the app. It is narrower than `calendar` or `calendar.events` across the account. See [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [calendars.insert](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert), and [events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Decision

Request `calendar.app.created` during the existing Google OAuth connection. Keep ordinary primary-calendar access read-only. Use `scripts/create_rfi91_calendar.py` once to create a named fictional secondary calendar and idempotent sample events, with no guests or notifications. Store only that calendar ID in the private local calendar SQLite database. Read its upcoming events alongside the primary calendar. The demo script refuses to run until the verified stored grant contains the new scope.

## Consequences

The connected user must reconnect Google once to grant the additional scope. The script can edit only the calendar it created, while ordinary personal calendar events remain on the existing read-only path. Disconnect removes the stored demo calendar ID; it does not delete the Google calendar itself. Historical sample events stay in Google Calendar, while Stellis's 14-day Home window shows only upcoming events.
