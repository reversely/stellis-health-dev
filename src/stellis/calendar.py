"""Read-only local Google and Microsoft calendar connections."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx

from stellis import storage

PROVIDERS = ("google", "microsoft")
_SCOPE = {
    "google": "https://www.googleapis.com/auth/calendar.events.readonly",
    "microsoft": "offline_access Calendars.ReadBasic",
}
_AUTH = {
    "google": "https://accounts.google.com/o/oauth2/v2/auth",
    "microsoft": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
}
_TOKEN = {
    "google": "https://oauth2.googleapis.com/token",
    "microsoft": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
}
_pending: dict[str, tuple[str, str, str, str, float]] = {}
_pending_lock = threading.Lock()


class CalendarError(Exception):
    """A safe, user-facing provider or connection error."""


def client_id(provider: str) -> str | None:
    if provider not in PROVIDERS:
        raise CalendarError("Unknown calendar provider")
    configured = _setting(f"STELLIS_{provider.upper()}_CALENDAR_CLIENT_ID")
    if configured or provider != "google":
        return configured
    return _setting("GOOGLE_OAUTH_CLIENT_ID")


def _setting(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    path = Path(__file__).resolve().parents[2] / ".env"
    if path.is_file():
        for line in path.read_text().splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def _google_secret() -> str | None:
    if _setting("STELLIS_GOOGLE_CALENDAR_CLIENT_ID"):
        return _setting("STELLIS_GOOGLE_CALENDAR_CLIENT_SECRET")
    return _setting("GOOGLE_OAUTH_CLIENT_SECRET")


def _connect() -> sqlite3.Connection:
    path = storage.data_dir() / "calendar_tokens.sqlite3"
    conn = sqlite3.connect(path)
    path.chmod(0o600)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS connections (
        provider TEXT PRIMARY KEY, client_id TEXT NOT NULL, access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL, expires_at REAL NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS notebook_assignments (
        provider TEXT NOT NULL, key_kind TEXT NOT NULL, event_key TEXT NOT NULL,
        title_key TEXT NOT NULL, attendees_json TEXT NOT NULL,
        notebook_id TEXT, PRIMARY KEY(provider, key_kind, event_key)
    )""")
    return conn


def connections() -> list[dict[str, object]]:
    with _connect() as conn:
        rows = {row["provider"] for row in conn.execute("SELECT provider FROM connections")}
    return [{"provider": provider, "configured": bool(client_id(provider)),
             "connected": provider in rows} for provider in PROVIDERS]


def redirect_uri(provider: str, port: int) -> str:
    host = "127.0.0.1" if provider == "google" else "localhost"
    return f"http://{host}:{port}/api/v1/calendar/{provider}/callback"


def authorize(provider: str, port: int, return_origin: str) -> str:
    configured_id = client_id(provider)
    if not configured_id:
        raise CalendarError(f"{provider.title()} Calendar is not configured")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    uri = redirect_uri(provider, port)
    with _pending_lock:
        now = time.time()
        for old, entry in list(_pending.items()):
            if entry[4] < now:
                del _pending[old]
        _pending[state] = (provider, verifier, uri, return_origin, now + 600)
    params = {"client_id": configured_id, "response_type": "code", "redirect_uri": uri,
              "scope": _SCOPE[provider], "state": state, "code_challenge": challenge,
              "code_challenge_method": "S256"}
    if provider == "google":
        params["access_type"] = "offline"
        params["prompt"] = "consent"
    return f"{_AUTH[provider]}?{urlencode(params)}"


def consume_state(provider: str, state: str) -> tuple[str, str, str]:
    with _pending_lock:
        entry = _pending.pop(state, None)
    if not entry or entry[0] != provider or entry[4] < time.time():
        raise CalendarError("Calendar connection expired. Try again.")
    return entry[1], entry[2], entry[3]


def _save(provider: str, response: dict, existing_refresh: str = "") -> None:
    access = response.get("access_token")
    refresh = response.get("refresh_token") or existing_refresh
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
        raise CalendarError("Calendar access was not granted. Connect again.")
    try:
        expires = max(60, int(response.get("expires_in", 3600)))
    except (TypeError, ValueError) as exc:
        raise CalendarError("Calendar token response was invalid") from exc
    with _connect() as conn:
        conn.execute("""INSERT INTO connections(provider, client_id, access_token, refresh_token, expires_at)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET
            client_id=excluded.client_id, access_token=excluded.access_token,
            refresh_token=excluded.refresh_token, expires_at=excluded.expires_at""",
            (provider, client_id(provider), access, refresh, time.time() + expires))


async def exchange(provider: str, code: str, verifier: str, uri: str) -> None:
    data = {"client_id": client_id(provider), "grant_type": "authorization_code",
            "code": code, "redirect_uri": uri, "code_verifier": verifier}
    if provider == "google" and (secret := _google_secret()):
        data["client_secret"] = secret
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.post(_TOKEN[provider], data=data)
        except httpx.HTTPError as exc:
            raise CalendarError("Calendar connection failed. Try again.") from exc
    if response.status_code != 200:
        raise CalendarError("Calendar connection was denied or expired. Try again.")
    _save(provider, response.json())


def disconnect(provider: str) -> None:
    if provider not in PROVIDERS:
        raise CalendarError("Unknown calendar provider")
    with _connect() as conn:
        conn.execute("DELETE FROM connections WHERE provider = ?", (provider,))


def clear_assignments() -> None:
    """Erase local calendar matching data when the account is deleted."""
    with _connect() as conn:
        conn.execute("DELETE FROM notebook_assignments")


async def _access_token(provider: str) -> str | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM connections WHERE provider = ?", (provider,)).fetchone()
    if row is None:
        return None
    if row["client_id"] != client_id(provider):
        raise CalendarError(f"Reconnect {provider.title()} Calendar after changing its app ID")
    if row["expires_at"] > time.time() + 60:
        return row["access_token"]
    data = {"client_id": client_id(provider), "grant_type": "refresh_token",
            "refresh_token": row["refresh_token"]}
    if provider == "google" and (secret := _google_secret()):
        data["client_secret"] = secret
    if provider == "microsoft":
        data["scope"] = _SCOPE[provider]
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.post(_TOKEN[provider], data=data)
        except httpx.HTTPError as exc:
            raise CalendarError("Calendar refresh failed. Try again.") from exc
    if response.status_code != 200:
        raise CalendarError(f"Reconnect {provider.title()} Calendar")
    _save(provider, response.json(), row["refresh_token"])
    return response.json()["access_token"]


def _instant(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _google_event(item: dict) -> dict | None:
    start = item.get("start") or {}
    end = item.get("end") or {}
    raw_start = start.get("dateTime") or start.get("date")
    raw_end = end.get("dateTime") or end.get("date")
    if not raw_start or not raw_end or item.get("status") == "cancelled":
        return None
    all_day = "date" in start and "dateTime" not in start
    return {"id": str(item.get("id", "")), "provider": "google",
            "series_id": str(item.get("recurringEventId") or ""),
            "attendees": sorted({str(person.get("email", "")).casefold() for person in item.get("attendees", [])
                                 if person.get("email")}),
            "title": str(item.get("summary") or "Untitled meeting")[:180],
            "start": raw_start if all_day else _instant(raw_start),
            "end": raw_end if all_day else _instant(raw_end), "all_day": all_day}


def _microsoft_event(item: dict) -> dict | None:
    start = item.get("start") or {}
    end = item.get("end") or {}
    if item.get("isCancelled") or not start.get("dateTime") or not end.get("dateTime"):
        return None
    return {"id": str(item.get("id", "")), "provider": "microsoft",
            "series_id": str(item.get("seriesMasterId") or ""),
            "attendees": sorted({str(person.get("emailAddress", {}).get("address", "")).casefold()
                                 for person in item.get("attendees", []) if person.get("emailAddress", {}).get("address")}),
            "title": str(item.get("subject") or "Untitled meeting")[:180],
            "start": _instant(start["dateTime"]), "end": _instant(end["dateTime"]),
            "all_day": bool(item.get("isAllDay"))}


async def events(provider: str, now: datetime | None = None) -> list[dict]:
    token = await _access_token(provider)
    if not token:
        return []
    now = now or datetime.now(timezone.utc)
    until = now + timedelta(days=14)
    if provider == "google":
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        params = {"timeMin": now.isoformat(), "timeMax": until.isoformat(),
                  "singleEvents": "true", "orderBy": "startTime", "maxResults": "100"}
    else:
        url = "https://graph.microsoft.com/v1.0/me/calendar/calendarView"
        params = {"startDateTime": now.isoformat(), "endDateTime": until.isoformat(), "$top": "100"}
    found: list[dict] = []
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(5):
            try:
                response = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
            except httpx.HTTPError as exc:
                raise CalendarError("Could not load meetings. Try Refresh.") from exc
            if response.status_code == 401:
                raise CalendarError(f"Reconnect {provider.title()} Calendar")
            if response.status_code != 200:
                raise CalendarError("Could not load meetings. Try Refresh.")
            data = response.json()
            items = data.get("items", []) if provider == "google" else data.get("value", [])
            for item in items:
                normalized = _google_event(item) if provider == "google" else _microsoft_event(item)
                if normalized:
                    found.append(normalized)
            if provider == "google":
                page = data.get("nextPageToken")
                if not page:
                    break
                params["pageToken"] = page
            else:
                next_url = data.get("@odata.nextLink")
                if not next_url:
                    break
                parsed = urlparse(next_url)
                if parsed.scheme != "https" or parsed.netloc != "graph.microsoft.com" or not parsed.path.startswith("/v1.0/me/calendar/"):
                    raise CalendarError("Calendar response contained an invalid page link")
                url, params = next_url, None
    found.sort(key=lambda event: event["start"])
    return found[:100]


def _title_key(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def assign_notebook(event: dict) -> dict:
    """Project an explicit event/series choice, then unambiguous title or attendees."""
    from stellis import notebooks
    with _connect() as conn:
        rows = [dict(row) for row in conn.execute("SELECT * FROM notebook_assignments WHERE provider = ?",
                                                  (event["provider"],))]
    valid = {str(book["id"]): str(book["name"]) for book in notebooks.list_notebooks()}
    def result(notebook_id: str | None, source: str) -> dict:
        return {**event, "notebook_id": notebook_id if notebook_id in valid else None,
                "notebook_name": valid.get(notebook_id),
                "assignment_source": source if notebook_id is None or notebook_id in valid else "none"}
    for kind, key in (("event", event["id"]), ("series", event.get("series_id"))):
        if key:
            match = next((row for row in rows if row["key_kind"] == kind and row["event_key"] == key), None)
            if match:
                return result(match["notebook_id"], kind)
    name = _title_key(str(event["title"]))
    title_matches = {row["notebook_id"] for row in rows if row["notebook_id"] in valid and row["title_key"] == name}
    if len(title_matches) == 1:
        return result(title_matches.pop(), "title")
    attendees = set(event.get("attendees", []))
    attendee_matches = {row["notebook_id"] for row in rows if row["notebook_id"] in valid
                        and len(attendees & set(json.loads(row["attendees_json"]))) >= 2}
    if len(attendee_matches) == 1:
        return result(attendee_matches.pop(), "attendees")
    name_matches = {str(book["id"]) for book in notebooks.list_notebooks()
                    if _title_key(str(book["name"])) and f" {_title_key(str(book['name']))} " in f" {name} "}
    if len(name_matches) == 1:
        return result(name_matches.pop(), "notebook name")
    return result(None, "none")


def save_notebook_assignment(event: dict, notebook_id: str | None, scope: str) -> dict:
    """Persist one user's choice; a null notebook is an explicit No notebook choice."""
    from stellis import notebooks
    if event.get("provider") not in PROVIDERS or not event.get("id") or scope not in ("event", "series"):
        raise CalendarError("Choose a calendar event")
    if scope == "series" and not event.get("series_id"):
        raise CalendarError("This meeting is not part of a series")
    if notebook_id is not None and not notebooks.exists(notebook_id):
        raise CalendarError("Notebook not found")
    key = str(event["id"] if scope == "event" else event["series_id"])
    attendees = sorted({str(value).casefold() for value in event.get("attendees", []) if value})
    with _connect() as conn:
        conn.execute("""INSERT INTO notebook_assignments
            (provider, key_kind, event_key, title_key, attendees_json, notebook_id)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(provider, key_kind, event_key) DO UPDATE SET
            title_key=excluded.title_key, attendees_json=excluded.attendees_json, notebook_id=excluded.notebook_id""",
            (event["provider"], scope, key, _title_key(str(event.get("title") or "")), json.dumps(attendees), notebook_id))
        if scope == "series":
            # The series choice includes the occurrence from which it was made.
            conn.execute("DELETE FROM notebook_assignments WHERE provider = ? AND key_kind = 'event' AND event_key = ?",
                         (event["provider"], event["id"]))
    return assign_notebook(event)
