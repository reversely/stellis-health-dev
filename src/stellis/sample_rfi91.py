"""Fictional RFI 91 case data and deterministic sample workspace seeding."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from starlette.datastructures import UploadFile

from stellis import agents, collections, library, notebooks, notes, pages, storage

PROJECTS = (
    ("water-treatment", "Water Treatment (sample)", "Mira (sample)", "Project coordinator"),
    ("transit-depot", "Transit Depot (sample)", "Ivo (sample)", "Design coordinator"),
    ("harbor-retrofit", "Harbor Retrofit (sample)", "Sol (sample)", "Construction specialist"),
    ("solar-yard", "Solar Yard (sample)", "Nia (sample)", "Procurement specialist"),
)

SPEC = """# Sample technical specification WT-04, revision B

Sample data. Section 4.2 requires the isolation valve body to be 316L stainless steel. The vendor must submit a material certificate traceable to the proposed valve and the revised valve schedule. Engineering must approve both before RFI 91 can be closed. The specification does not establish whether the vendor's current C316 certificate meets revision B.
"""
STATUS = """# Sample RFI 91 status

Sample data. RFI 91 opened on 2026-09-28. The response package is waiting for the revised isolation valve schedule and a vendor material certificate. At the 2026-10-10 coordination meeting, the target response date moved from 2026-10-11 to 2026-10-22. The engineering review is still open.
"""
MEETING_NOTES = """# Sample RFI 91 coordination notes

Sample data. The construction manager asked why RFI 91 remained open. The team confirmed the missing revised valve schedule and vendor material certificate. The 2026-10-10 coordination meeting moved the target response date to 2026-10-22. Whether certificate C316 meets specification WT-04 revision B remains unverified. A reply may say the package is under engineering review; closure requires engineer sign-off.
"""

MAIL_THREADS = ({
    "id": "sample-rfi91-thread",
    "messages": [
        {"id": "sample-rfi91-open", "subject": "WT-04 RFI 91 isolation valve", "sender": "manager@buildco.example",
         "toRecipients": ["consultant@epcm.example"], "ccRecipients": [], "date": "2026-09-28",
         "plaintextBody": "Sample data. We opened RFI 91 today, September 28, to confirm the isolation valve material and schedule for Water Treatment.",
         "labelIds": ["INBOX", "Label_WaterTreatment"]},
        {"id": "sample-rfi91-block", "subject": "Re: WT-04 RFI 91 isolation valve", "sender": "engineer@epcm.example",
         "toRecipients": ["manager@buildco.example"], "ccRecipients": [], "date": "2026-10-09",
         "plaintextBody": "Sample data. We cannot close RFI 91 without the revised isolation valve schedule and a material certificate traceable to the proposed valve. Certificate C316 has arrived, but its compliance with WT-04 revision B has not been confirmed.",
         "labelIds": ["SENT", "Label_WaterTreatment"]},
        {"id": "sample-rfi91-deadline", "subject": "Re: WT-04 RFI 91 isolation valve", "sender": "consultant@epcm.example",
         "toRecipients": ["manager@buildco.example"], "ccRecipients": [], "date": "2026-10-10",
         "plaintextBody": "Sample data. In today's coordination meeting we moved the target response from October 11 to October 22. Please do not state that RFI 91 is closed; engineering sign-off is still pending.",
         "labelIds": ["SENT", "Label_WaterTreatment"]},
    ],
},)

ANSWER_KEY = (
    {"id": "opened", "fact": "RFI 91 opened on 2026-09-28", "sources": ("mail:sample-rfi91-open", "page:status")},
    {"id": "blocked", "fact": "The revised valve schedule and traceable material certificate were missing",
     "sources": ("mail:sample-rfi91-block", "page:spec", "passage:rfi91-2", "note:meeting")},
    {"id": "deadline", "fact": "The 2026-10-10 coordination meeting moved the target from 2026-10-11 to 2026-10-22",
     "sources": ("mail:sample-rfi91-deadline", "page:status", "passage:rfi91-3")},
    {"id": "uncertain", "fact": "Certificate C316 compliance with WT-04 revision B is unverified",
     "sources": ("mail:sample-rfi91-block", "page:spec", "passage:rfi91-5")},
    {"id": "safe_reply", "fact": "The package is under engineering review; do not promise closure before sign-off",
     "sources": ("mail:sample-rfi91-deadline", "page:spec", "passage:rfi91-5", "note:meeting")},
)


def _fixture_path(name: str) -> Path:
    return Path(__file__).with_name("fixtures") / name


def _items() -> dict[str, tuple[str, str]]:
    with storage.connect() as conn:
        return {str(row["key"]): (str(row["kind"]), str(row["item_id"]))
                for row in conn.execute("SELECT key, kind, item_id FROM sample_items WHERE key LIKE 'rfi91:%'")}


def _mark(key: str, kind: str, item_id: str) -> None:
    with storage.connect() as conn:
        conn.execute("INSERT INTO sample_items (key, kind, item_id) VALUES (?, ?, ?)",
                     (f"rfi91:{key}", kind, item_id))


def status() -> dict[str, object]:
    items = _items()
    return {"sample": True, "installed": "rfi91:conversation" in items,
            "conversation_id": items.get("rfi91:conversation", (None, None))[1],
            "projects": [{"key": key, "name": name, "agent_name": agent, "agent_role": role,
                          "agent_id": items.get(f"rfi91:agent:{key}", (None, None))[1],
                          "notebook_id": items.get(f"rfi91:notebook:{key}", (None, None))[1]}
                         for key, name, agent, role in PROJECTS],
            "answer_key": [{**entry, "sources": list(entry["sources"])} for entry in ANSWER_KEY]}


def seed() -> dict[str, object]:
    """Add the fixture once; use its own source audio and fixed source IDs."""
    from stellis import importer
    existing = _items()
    if "rfi91:conversation" in existing:
        return status()
    collection = collections.create("Consulting case (sample)")
    _mark("collection", "collection", str(collection["id"]))
    books = {}
    for key, name, _, _ in PROJECTS:
        book = notebooks.create(name)
        collections.assign_notebook(str(book["id"]), str(collection["id"]))
        _mark(f"notebook:{key}", "notebook", str(book["id"]))
        books[key] = str(book["id"])
    for key, _, agent_name, role in PROJECTS:
        agent = agents.create(agent_name, role, f"Keep the {key.replace('-', ' ')} project notebook current.",
                              books[key], True)
        _mark(f"agent:{key}", "agent", str(agent["id"]))
        if key == "water-treatment":
            agents.remember_email_convention(str(agent["id"]), books[key], MAIL_THREADS[0]["messages"][0])
    for key, title, body in (("spec", "WT-04 technical specification (sample)", SPEC),
                             ("status", "RFI 91 status (sample)", STATUS)):
        page = pages.create(title, books["water-treatment"], body)
        _mark(f"page:{key}", "page", str(page["id"]))
    audio = _fixture_path("rfi91_meeting.mp3")
    with audio.open("rb") as handle:
        conversation, duplicate = asyncio.run(importer.import_upload(UploadFile(file=handle, filename="rfi91_meeting.mp3")))
    if duplicate:
        raise RuntimeError("Sample audio already belongs to another conversation")
    conversation_id = str(conversation["id"])
    _mark("conversation", "conversation", conversation_id)
    storage.rename_conversation(conversation_id, "RFI 91 coordination (sample)")
    notebooks.assign(conversation_id, books["water-treatment"])
    notes.save("conversation", conversation_id, MEETING_NOTES, 0)
    segments = []
    for entry in json.loads(_fixture_path("rfi91_audio.json").read_text())["segments"]:
        segments.append({"id": entry["id"], "start_ms": entry["start_ms"], "end_ms": entry["end_ms"],
                         "text": entry["spoken_text"], "speaker_cluster_id": entry["speaker"],
                         "speaker_uncertain": False, "words": []})
    storage.save_transcript({"conversation_id": conversation_id, "revision": 1, "language": "en",
                             "pipeline_version": "rfi91-fixture", "segments_json": json.dumps(segments),
                             "turns_json": "[]", "updated_at": datetime.now(timezone.utc).isoformat()})
    return status()


def reset() -> dict[str, object]:
    """Remove only RFI fixture rows and media, then restore the original seed."""
    items = _items()
    for key, (kind, item_id) in items.items():
        if kind == "conversation":
            try:
                library.move_to_trash(item_id)
                library.delete_permanently(item_id)
            except LookupError:
                pass
        elif kind == "page":
            try:
                pages.move_to_trash(item_id)
                pages.delete_permanently(item_id)
            except LookupError:
                pass
    for kind in ("agent", "notebook", "collection"):
        for _, (item_kind, item_id) in items.items():
            if item_kind == kind:
                (agents.delete if kind == "agent" else notebooks.delete if kind == "notebook" else collections.delete)(item_id)
    with storage.connect() as conn:
        conn.execute("DELETE FROM sample_items WHERE key LIKE 'rfi91:%'")
    return seed()
