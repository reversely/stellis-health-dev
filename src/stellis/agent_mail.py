"""Retrieve bounded Gmail evidence for a selected Stellis agent."""

from __future__ import annotations

import re

from stellis import agents, calendar, gmail_api


def _queries(question: str, memories: list[dict]) -> tuple[str, str] | None:
    """Use project convention first, then retry one broader Gmail search."""
    rfi = re.search(r"\bRFI\s*#?\s*(\d+)\b", question, re.IGNORECASE)
    address = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", question)
    if not rfi and not address and not re.search(r"\b(email|mail|thread|draft|reply|inbox)\b", question, re.I):
        return None
    convention = next((str(item["fact"]) for item in memories
                       if item["kind"] == "email_convention"), "")
    subject = re.search(r"subjects? begin ([^;.]*)", convention, re.IGNORECASE)
    label = re.search(r"labels?:\s*([^;.]*)", convention, re.IGNORECASE)
    domain = re.search(r"domains?:\s*([^;, ]+)", convention, re.IGNORECASE)
    if not rfi and not address and not convention:
        return None
    identifier = f"RFI {rfi.group(1)}" if rfi else ""
    broad = f'subject:"{identifier}"' if identifier else (
        f"from:{address.group(0)}" if address else " ".join(
            word for word in re.findall(r"[\w-]+", question) if len(word) > 3)[:120])
    if not broad:
        return None
    terms = []
    if label:
        terms.append(f"label:{label.group(1).split(',')[0].strip()[:80]}")
    if subject:
        terms.append(f'subject:"{subject.group(1).strip()[:80]}"')
    if domain:
        terms.append(f"from:{domain.group(1)[:80]}")
    if address:
        terms.append(f"from:{address.group(0)}")
    explicit_after = re.search(r"\bafter:(\d{4}/\d{1,2}/\d{1,2})\b", question)
    if explicit_after:
        terms.append(f"after:{explicit_after.group(1)}")
    if re.search(r"\b(sent|I wrote)\b", question, re.I):
        terms.append("in:sent")
    return " ".join([*terms, broad]), broad


async def sources(agent: dict, question: str, notebook_id: str | None,
                  memories: list[dict]) -> list[dict[str, object]]:
    """Search normal Gmail API, and create links only from returned IDs."""
    queries = _queries(question, memories)
    if not queries or not next(item for item in calendar.connections() if item["provider"] == "google")["mail_connected"]:
        return []
    found = await gmail_api.search_threads(queries[0], pageSize=3)
    if not found["threads"] and queries[1] != queries[0]:
        found = await gmail_api.search_threads(queries[1], pageSize=3)
    result = []
    remembered = any(item["kind"] == "email_convention" and item["notebook_id"] == notebook_id
                     for item in memories)
    for thread in found["threads"][:3]:
        full = await gmail_api.get_thread(str(thread["id"]))
        for message in full["messages"][-4:]:
            if notebook_id and not agent["is_default"] and not remembered:
                agents.remember_email_convention(str(agent["id"]), notebook_id, message)
                remembered = True
            body = str(message.get("plaintextBody") or message.get("snippet") or "")[:1200]
            result.append({"source_id": f"mail:{message['id']}",
                           "title": f"Email: {message['subject']} ({message['date']})",
                           "excerpt": f"From: {message['sender']}\n{body}",
                           "target": f"https://mail.google.com/mail/u/0/#all/{thread['id']}",
                           "start_ms": None})
            if len(result) >= 8:
                return result
    return result
