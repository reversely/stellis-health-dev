"""The sources a notebook's chat can read, and which of them the user has unchecked.

A source id names its kind: ``conversation:<id>`` for a recording or imported audio
file, ``page:<id>`` for a written note. The selection stores unchecked sources only,
so a source added later starts checked.
"""
from __future__ import annotations

from stellis import storage

LIMIT = 50


def _table(conn) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS notebook_source_exclusions (
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL, PRIMARY KEY (notebook_id, source_id))""")


def _require(conn, notebook_id: str) -> None:
    if conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone() is None:
        raise LookupError("Notebook not found")


def _conversation_status(conn, conversation_id: str) -> str:
    """A conversation is ready once it has a transcript; until then its latest speech job decides."""
    if conn.execute("SELECT 1 FROM transcripts WHERE conversation_id = ?", (conversation_id,)).fetchone():
        return "ready"
    job = conn.execute("""SELECT state FROM processing_jobs WHERE conversation_id = ? AND kind = 'speech'
        ORDER BY created_at DESC LIMIT 1""", (conversation_id,)).fetchone()
    return "failed" if job and job["state"] == "failed" else "processing"


def list_sources(notebook_id: str) -> list[dict[str, object]]:
    """Return the notebook's sources newest first, each with its status and whether it is checked."""
    with storage.connect() as conn:
        _table(conn)
        _require(conn, notebook_id)
        excluded = {row[0] for row in conn.execute(
            "SELECT source_id FROM notebook_source_exclusions WHERE notebook_id = ?", (notebook_id,))}
        recorded = {row[0] for row in conn.execute(
            "SELECT conversation_id FROM recording_sessions WHERE conversation_id IS NOT NULL")}
        sources = []
        for row in conn.execute("""SELECT id, title, COALESCE(recorded_at, created_at) AS created_at FROM conversations
                WHERE notebook_id = ? AND trashed_at IS NULL""", (notebook_id,)).fetchall():
            sources.append({"id": "conversation:" + row["id"], "type": "recording" if row["id"] in recorded else "audio",
                            "title": row["title"], "created_at": row["created_at"],
                            "status": _conversation_status(conn, row["id"])})
        for row in conn.execute("SELECT id, title, created_at FROM pages WHERE notebook_id = ? AND trashed_at IS NULL",
                                (notebook_id,)).fetchall():
            sources.append({"id": "page:" + row["id"], "type": "note", "title": row["title"],
                            "created_at": row["created_at"], "status": "ready"})
    for source in sources:
        source["selected"] = source["status"] == "ready" and source["id"] not in excluded
    return sorted(sources, key=lambda source: str(source["created_at"]), reverse=True)


def save_selection(notebook_id: str, excluded: list[str]) -> list[dict[str, object]]:
    """Replace the notebook's unchecked sources; ids that are not in the notebook are ignored."""
    if not isinstance(excluded, list) or not all(isinstance(item, str) for item in excluded):
        raise ValueError("Send the unchecked sources as a list of source ids")
    known = {str(source["id"]) for source in list_sources(notebook_id)}
    with storage.connect() as conn:
        _table(conn)
        conn.execute("DELETE FROM notebook_source_exclusions WHERE notebook_id = ?", (notebook_id,))
        conn.executemany("INSERT INTO notebook_source_exclusions (notebook_id, source_id) VALUES (?, ?)",
                         [(notebook_id, item) for item in dict.fromkeys(excluded) if item in known])
    return list_sources(notebook_id)
