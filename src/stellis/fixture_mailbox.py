"""Deterministic Gmail-shaped fixture mailbox; never sends mail."""

from __future__ import annotations

import copy
import shlex
import uuid
from datetime import date

from stellis import sample_rfi91


class FixtureMailbox:
    """Implement search_threads, get_thread, and create_draft for sample jobs."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.threads = copy.deepcopy(list(sample_rfi91.MAIL_THREADS))
        self.drafts: list[dict[str, object]] = []

    @staticmethod
    def _matches(message: dict, query: str) -> bool:
        try:
            terms = shlex.split(query)
        except ValueError:
            return False
        text = " ".join((message["subject"], message["plaintextBody"])).casefold()
        for term in terms:
            if ":" not in term:
                if term.casefold() not in text:
                    return False
                continue
            operator, value = term.split(":", 1)
            value = value.casefold()
            if operator == "from" and value not in message["sender"].casefold():
                return False
            if operator == "subject" and value not in message["subject"].casefold():
                return False
            if operator == "label" and value not in [label.casefold() for label in message["labelIds"]]:
                return False
            if operator == "in" and value.upper() not in message["labelIds"]:
                return False
            if operator == "after" and message["date"] <= value.replace("/", "-"):
                return False
            if operator not in {"from", "subject", "label", "in", "after"}:
                return False
        return True

    @staticmethod
    def _message(message: dict, full: bool) -> dict:
        result = {key: copy.deepcopy(message[key]) for key in
                  ("id", "subject", "sender", "toRecipients", "ccRecipients", "date", "labelIds")}
        result["snippet"] = message["plaintextBody"][:120]
        if full:
            result.update(plaintextBody=message["plaintextBody"], htmlBody="", attachmentIds=[], attachments=[])
        return result

    def search_threads(self, query: str = "", pageSize: int = 20, pageToken: str = "",
                       includeTrash: bool = False, view: str = "THREAD_VIEW_MINIMAL") -> dict:
        """Return Gmail's minimal thread response and stable fixture pagination."""
        if not 1 <= pageSize <= 50:
            raise ValueError("pageSize must be 1–50")
        if view not in ("THREAD_VIEW_MINIMAL", "THREAD_VIEW_UNSPECIFIED", "THREAD_VIEW_METADATA_ONLY"):
            raise ValueError("Unknown thread view")
        start = int(pageToken or 0)
        matches = [thread for thread in self.threads if any(self._matches(message, query) for message in thread["messages"])
                   and (includeTrash or not all("TRASH" in message["labelIds"] for message in thread["messages"]))]
        selected = matches[start:start + pageSize]
        result = {"threads": [{"id": thread["id"], "messages": [self._message(message, False)
                   for message in thread["messages"]]} for thread in selected],
                  "resultCountEstimate": str(len(matches))}
        if start + pageSize < len(matches):
            result["nextPageToken"] = str(start + pageSize)
        if view == "THREAD_VIEW_METADATA_ONLY":
            for thread in result["threads"]:
                for message in thread["messages"]:
                    message.pop("subject"); message.pop("snippet")
        return result

    def get_thread(self, threadId: str, messageFormat: str = "FULL_CONTENT") -> dict:
        """Return the fixture thread in Google's documented format."""
        if messageFormat not in ("FULL_CONTENT", "MINIMAL", "METADATA_ONLY", "MESSAGE_FORMAT_UNSPECIFIED"):
            raise ValueError("Unknown message format")
        thread = next((item for item in self.threads if item["id"] == threadId), None)
        if thread is None:
            raise LookupError("Thread not found")
        messages = [self._message(message, messageFormat in ("FULL_CONTENT", "MESSAGE_FORMAT_UNSPECIFIED"))
                    for message in thread["messages"]]
        if messageFormat == "METADATA_ONLY":
            for message in messages:
                message.pop("subject"); message.pop("snippet")
        return {"id": threadId, "messages": messages}

    def create_draft(self, to: list[str], subject: str, body: str, cc: list[str] | None = None,
                     bcc: list[str] | None = None, replyToMessageId: str | None = None) -> dict:
        """Create a reviewable draft only; sending is deliberately absent."""
        if not to or not subject.strip() or not body.strip():
            raise ValueError("A draft needs a recipient, subject, and body")
        if replyToMessageId and not any(replyToMessageId == message["id"] for thread in self.threads
                                       for message in thread["messages"]):
            raise LookupError("Reply message not found")
        draft_id = "sample-draft-" + uuid.uuid4().hex
        self.drafts.append({"id": draft_id, "to": list(to), "cc": list(cc or []), "bcc": list(bcc or []),
                            "subject": subject, "body": body, "replyToMessageId": replyToMessageId,
                            "created": date.today().isoformat(), "sample": True})
        return {"id": draft_id}


def rfi91_sources(notebook_id: str | None, question: str) -> list[dict[str, object]]:
    """Expose the sample project's mailbox as cited evidence for its agent."""
    if not any(term in question.casefold() for term in ("rfi", "valve", "certificate", "schedule")):
        return []
    case = sample_rfi91.status()
    project = next((item for item in case["projects"] if item["key"] == "water-treatment"), None)
    if not case["installed"] or not project or notebook_id != project["notebook_id"]:
        return []
    mailbox = FixtureMailbox()
    # Start with the stored project convention, then broaden once if it finds nothing.
    queries = ("label:Label_WaterTreatment subject:RFI", "subject:RFI")
    found = next((result for query in queries
                  if (result := mailbox.search_threads(query))["threads"]), None)
    if not found:
        return []
    sources = []
    for thread in found["threads"]:
        for message in mailbox.get_thread(thread["id"])["messages"]:
            sources.append({"source_id": f"mail:{message['id']}",
                            "title": f"Email: {message['subject']} ({message['date']})",
                            "excerpt": message["plaintextBody"],
                            "target": f"/api/v1/samples/rfi91/mail/{message['id']}",
                            "start_ms": None})
    return sources[:12]
