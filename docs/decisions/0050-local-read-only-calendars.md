# ADR 0050: Local read-only calendar connections

Status: accepted for the development browser workspace, 2026-10-16. Implements #183 and #184; #185 tracks later reminders and cross-device design.

## Decision

Connect Google Calendar and Microsoft Outlook/Microsoft 365 from the loopback device service using authorization code with PKCE and public desktop clients. Fetch the next 14 days from the primary/default calendar when the user opens or refreshes the home page. Show title and time, with a Record action that supplies the local recording title. Request only event-read permission: Google `calendar.events.readonly` and Microsoft delegated `Calendars.ReadBasic` plus `offline_access` for token renewal.

Tokens are in a separate private local SQLite file with `0600` permissions. They are plaintext on the local device, like current local recordings and notes; they never enter the separate encrypted sync service. Event bodies, attendees, locations, and meeting links are discarded by normalization. The displayed event list is held in browser memory and fetched again on refresh. Calendar content is not included in Nebius requests. Disconnect deletes local tokens; provider-side grants must be revoked in provider account settings.

## Evidence and boundaries

- Google documents [desktop loopback PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [read-only event scope](https://developers.google.com/workspace/calendar/api/auth), and [event pagination](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). These establish provider protocol support, not a live Stellis connection test.
- Microsoft documents [desktop public-client redirects](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration), [localhost path/port matching](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url), and [calendarView permissions](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0). These establish provider protocol support, not a live Stellis connection test.
- The local API and mocked providers were exercised in tests. Chromium displayed a mocked connected Google event at desktop and 390-pixel widths and carried its title into the recording workspace. Real provider consent and organization admin-policy behavior remain unverified until client IDs and consenting accounts are available.

The project previously limited external integrations to FOSS services with Nebius as an exception. The user's explicit request for Google and Outlook calendar integrations authorizes this additional exception. No proprietary SDK is added to the application.

## Deferred

The device checks for meetings only while running. Hosted background reminders would require a new token or event-data custody decision and a threat model. Cross-device calendar display would need an encrypted event format and deletion semantics. Calendar writes, meeting bots, and AI use of calendar context require separate user choices and tickets.
