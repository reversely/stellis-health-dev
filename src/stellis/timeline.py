"""The health timeline: documents, recordings and accepted facts by date.

Each entry sorts by its clinical date: a document's record date, a
recording's capture date and a fact's own date. Upload time counts only when a
record has no other date.
"""

from __future__ import annotations

from stellis import documents
from stellis import health_facts
from stellis import storage

KINDS = ("document", "recording", "fact")


def _date(*values: object) -> str:
    """Returns the first non-empty value as YYYY-MM-DD."""
    return next(str(value)[:10] for value in values if value)


def _measurement(fact: dict[str, object]) -> str:
    return " ".join(str(part) for part in (fact["value"], fact["unit"]) if part)


def _documents() -> list[dict[str, object]]:
    return [{
        "kind": "document",
        "date": _date(item["record_date"], item["created_at"]),
        "title": item["title"],
        "detail": "PDF" if item["media_type"] == "application/pdf" else "Image",
        "target": f"/document/{item['id']}",
        "notebook_id": item["notebook_id"],
    } for item in documents.list_all()]


def _recordings() -> list[dict[str, object]]:
    rows = storage.list_conversations()
    return [{
        "kind": "recording",
        "date": _date(row["recorded_at"], row["created_at"]),
        "title": row["title"],
        "detail": "Recording",
        "target": f"/conversation/{row['id']}",
        "notebook_id": row["notebook_id"],
    } for row in rows]


def _facts() -> list[dict[str, object]]:
    return [{
        "kind": "fact",
        "fact_kind": fact["kind"],
        "date": fact["date"],
        "title": fact["name"],
        "detail": _measurement(fact),
        "source": fact["document_title"],
        "target": fact["target"],
        "notebook_id": fact["notebook_id"],
    } for fact in health_facts.accepted()]


def entries(notebook_id: str | None = None,
            kinds: tuple[str, ...] = KINDS) -> list[dict[str, object]]:
    """Lists timeline entries, newest clinical date first.

    Args:
        notebook_id: Limits the timeline to one notebook when given.
        kinds: The entry kinds to include, from ``KINDS``.

    Returns:
        One dict per entry with ``kind``, ``date``, ``title``, ``detail``,
        ``target`` and ``notebook_id``. A fact also has ``fact_kind`` and
        ``source``. Entries on the same date keep documents and recordings
        before the facts taken from them.

    Raises:
        ValueError: ``kinds`` names an unknown kind.
    """
    unknown = set(kinds) - set(KINDS)
    if unknown:
        raise ValueError("Choose documents, recordings or facts")
    readers = {
        "document": _documents,
        "recording": _recordings,
        "fact": _facts,
    }
    items = [item for kind in kinds for item in readers[kind]()]
    if notebook_id is not None:
        with storage.connect() as conn:
            linked = {r[0] for r in conn.execute('SELECT source_id FROM notebook_record_links WHERE notebook_id = ?', (notebook_id,))}
        def belongs(item):
            path = str(item['target']).split('?')[0].split('#')[0]
            prefix = 'document:' if path.startswith('/document/') else 'conversation:'
            return item['notebook_id'] == notebook_id or prefix+path.rsplit('/',1)[-1] in linked
        items = [item for item in items if belongs(item)]
    order = {kind: index for index, kind in enumerate(KINDS)}
    items.sort(key=lambda item: (item["date"], -order[item["kind"]]),
               reverse=True)
    return items
