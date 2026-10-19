"""Create the fictional RFI 91 secondary calendar for the connected Google account.

Run from the repository root after reconnecting Google in Account settings. The
calendar is app-created and contains no attendees or notifications.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from urllib.parse import quote

import httpx

from stellis import calendar

FIXTURE = Path(__file__).resolve().parents[1] / "docs/fixtures/rfi91-demo-calendar.json"
SCOPE = "https://www.googleapis.com/auth/calendar.app.created"


async def main() -> None:
    with calendar._connect() as conn:
        row = conn.execute("SELECT scopes FROM connections WHERE provider = 'google'").fetchone()
    if row is None or SCOPE not in row["scopes"].split():
        raise SystemExit("Reconnect Google in Stellis Account settings to grant calendar.app.created, then rerun.")
    token = await calendar._access_token("google")
    if not token:
        raise SystemExit("Google Calendar is not connected.")
    fixture = json.loads(FIXTURE.read_text())
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    calendar_id = calendar.demo_calendar_id()
    async with httpx.AsyncClient(timeout=20) as client:
        if not calendar_id:
            response = await client.post("https://www.googleapis.com/calendar/v3/calendars",
                                         headers=headers, json=fixture["calendar"])
            if response.status_code != 200:
                raise SystemExit(f"Google calendar creation failed ({response.status_code}): {response.text[:300]}")
            calendar_id = str(response.json()["id"])
            calendar.save_demo_calendar_id(calendar_id)
            print("Created RFI 91 demo calendar.")
        else:
            print("Using existing RFI 91 demo calendar.")
        endpoint = f"https://www.googleapis.com/calendar/v3/calendars/{quote(calendar_id, safe='')}/events"
        for event in fixture["events"]:
            response = await client.post(endpoint, headers=headers, params={"sendUpdates": "none"}, json=event)
            if response.status_code == 409:
                print(f"Already present: {event['summary']}")
            elif response.status_code == 200:
                print(f"Created: {event['summary']}")
            else:
                raise SystemExit(f"Google event creation failed ({response.status_code}): {response.text[:300]}")
    print("Refresh Home in Stellis to see upcoming demo events.")


if __name__ == "__main__":
    asyncio.run(main())
