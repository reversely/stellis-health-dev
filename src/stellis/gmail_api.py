"""Use the ordinary Gmail API for mail tools while MCP preview access is pending."""

from __future__ import annotations

import asyncio
import base64
import binascii
import re
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import httpx

from stellis import calendar

BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailError(Exception):
    """A safe mail connection or provider error."""


async def _request(method: str, path: str, *, params: dict | None = None,
                   payload: dict | None = None) -> dict:
    connection = next(item for item in calendar.connections() if item["provider"] == "google")
    if not connection["mail_connected"]:
        raise GmailError("Connect Gmail in Settings first")
    try:
        token = await calendar._access_token("google")
    except calendar.CalendarError as exc:
        raise GmailError("Reconnect Gmail in Settings") from exc
    if not token:
        raise GmailError("Reconnect Gmail in Settings")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(method, BASE + path, params=params, json=payload,
                                            headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise GmailError("Gmail could not complete the request") from exc
    if not isinstance(result, dict):
        raise GmailError("Gmail returned an invalid response")
    return result


def _header(payload: dict, name: str) -> str:
    return next((str(item.get("value", "")) for item in payload.get("headers", [])
                 if str(item.get("name", "")).casefold() == name.casefold()), "")


def _plain(payload: dict) -> str:
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        encoded = str(payload["body"]["data"])
        try:
            return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8", "replace")
        except (ValueError, binascii.Error):
            return ""
    return next((text for part in payload.get("parts", []) if (text := _plain(part))), "")


def _message(item: dict, full: bool) -> dict:
    payload = item.get("payload") or {}
    date = _header(payload, "Date")
    try:
        stamp = parsedate_to_datetime(date).date().isoformat()
    except (TypeError, ValueError):
        stamp = datetime.fromtimestamp(int(item.get("internalDate", 0)) / 1000,
                                       timezone.utc).date().isoformat()
    result = {"id": str(item.get("id", "")), "subject": _header(payload, "Subject"),
              "sender": _header(payload, "From"),
              "toRecipients": [value.strip() for value in _header(payload, "To").split(",") if value.strip()],
              "ccRecipients": [value.strip() for value in _header(payload, "Cc").split(",") if value.strip()],
              "date": stamp, "labelIds": list(item.get("labelIds") or []),
              "snippet": str(item.get("snippet", ""))}
    if full:
        result.update(plaintextBody=_plain(payload) or result["snippet"], htmlBody="",
                      attachmentIds=[], attachments=[])
    return result


async def search_threads(query: str = "", pageSize: int = 20, pageToken: str = "",
                         includeTrash: bool = False, view: str = "THREAD_VIEW_MINIMAL") -> dict:
    """Search Gmail with its native in:, label:, from:, subject:, and after: syntax."""
    if len(query) > 500 or not 1 <= pageSize <= 50:
        raise ValueError("Invalid Gmail search")
    if view not in {"THREAD_VIEW_MINIMAL", "THREAD_VIEW_UNSPECIFIED", "THREAD_VIEW_METADATA_ONLY"}:
        raise ValueError("Unknown thread view")
    params = {"q": query, "maxResults": pageSize, "includeSpamTrash": str(includeTrash).lower()}
    if pageToken:
        params["pageToken"] = pageToken
    listed = await _request("GET", "/threads", params=params)
    identifiers = [str(item["id"]) for item in listed.get("threads", []) if item.get("id")]
    threads = await asyncio.gather(*(get_thread(identifier, "METADATA_ONLY" if
                               view == "THREAD_VIEW_METADATA_ONLY" else "MINIMAL")
                               for identifier in identifiers))
    result = {"threads": threads, "resultCountEstimate": str(listed.get("resultSizeEstimate", 0))}
    if listed.get("nextPageToken"):
        result["nextPageToken"] = str(listed["nextPageToken"])
    return result


async def profile() -> dict[str, str]:
    """Identify the granted Gmail account without exposing its token."""
    result = await _request("GET", "/profile")
    email = str(result.get("emailAddress") or "").casefold()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise GmailError("Gmail returned an invalid account")
    return {"email": email}


async def get_thread(threadId: str, messageFormat: str = "FULL_CONTENT") -> dict:
    """Read one thread with the same public shape as the fixture mailbox."""
    if messageFormat not in {"FULL_CONTENT", "MINIMAL", "METADATA_ONLY", "MESSAGE_FORMAT_UNSPECIFIED"}:
        raise ValueError("Unknown message format")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", threadId):
        raise ValueError("Invalid Gmail thread ID")
    raw = await _request("GET", f"/threads/{quote(threadId)}", params={"format": "full"})
    full = messageFormat in {"FULL_CONTENT", "MESSAGE_FORMAT_UNSPECIFIED"}
    messages = [_message(item, full) for item in raw.get("messages", [])]
    if messageFormat == "METADATA_ONLY":
        for item in messages:
            item.pop("subject", None)
            item.pop("snippet", None)
    return {"id": threadId, "messages": messages}


async def create_draft(to: list[str], subject: str, body: str, cc: list[str] | None = None,
                       bcc: list[str] | None = None, replyToMessageId: str | None = None) -> dict:
    """Create a Gmail draft for the user to review; this module has no send call."""
    recipients = [*to, *(cc or []), *(bcc or [])]
    if not to or not subject.strip() or not body.strip() or any("\n" in value or "\r" in value
                                                                for value in [*recipients, subject]):
        raise ValueError("A draft needs safe recipients, subject, and body")
    message = EmailMessage()
    message["To"] = ", ".join(to)
    message["Subject"] = subject.strip()
    if cc:
        message["Cc"] = ", ".join(cc)
    if bcc:
        message["Bcc"] = ", ".join(bcc)
    message.set_content(body)
    draft: dict[str, object] = {}
    if replyToMessageId:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", replyToMessageId):
            raise ValueError("Invalid reply message ID")
        original = await _request("GET", f"/messages/{quote(replyToMessageId)}",
                                  params={"format": "metadata"})
        parent_id = _header(original.get("payload") or {}, "Message-ID")
        if parent_id:
            message["In-Reply-To"] = parent_id
            message["References"] = parent_id
        if original.get("threadId"):
            draft["threadId"] = original["threadId"]
    draft["raw"] = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    result = await _request("POST", "/drafts", payload={"message": draft})
    return {"id": str(result["id"])}
