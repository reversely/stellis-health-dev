"""Standalone revisioned Markdown pages (ADR 0058)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from stellis import storage, suggestions, todos
from stellis.notes import MAX_MARKDOWN

COLUMNS = "id, title, markdown, revision, notebook_id, created_at, updated_at"


class TooLarge(ValueError):
    """The Markdown body exceeds the byte cap."""


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _title(value: str | None) -> str:
    title = " ".join((value or "").split())
    if not title:
        return "Untitled"
    if len(title) > 200:
        raise ValueError("Enter a title of at most 200 characters")
    return title


def _check_notebook(conn, notebook_id: str | None) -> None:
    if notebook_id is not None and conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone() is None:
        raise LookupError("Notebook not found")


def _check_markdown(markdown: str) -> None:
    if not isinstance(markdown, str) or len(markdown.encode("utf-8")) > MAX_MARKDOWN:
        raise TooLarge("Page is too large")


def _active(conn, page_id: str):
    row = conn.execute(f"SELECT {COLUMNS} FROM pages WHERE id = ? AND trashed_at IS NULL", (page_id,)).fetchone()
    if row is None:
        raise LookupError("Page not found")
    return row


def create(title: str | None = None, notebook_id: str | None = None, markdown: str = "") -> dict[str, object]:
    name = _title(title)
    _check_markdown(markdown)
    stamp = _stamp()
    page_id = str(uuid.uuid4())
    with storage.connect() as conn:
        _check_notebook(conn, notebook_id)
        markdown = todos.reindex(conn, "page", page_id, markdown)
        conn.execute("INSERT INTO pages (id, title, markdown, notebook_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (page_id, name, markdown, notebook_id, stamp, stamp))
        return dict(_active(conn, page_id))


def get(page_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        return dict(_active(conn, page_id))


def list_pages(notebook_id: str | None = None) -> list[dict[str, object]]:
    """List active pages: one notebook, `"none"` for pages without a notebook, or all."""
    where, args = "trashed_at IS NULL", ()
    if notebook_id == "none":
        where += " AND notebook_id IS NULL"
    elif notebook_id is not None:
        where, args = where + " AND notebook_id = ?", (notebook_id,)
    with storage.connect() as conn:
        rows = conn.execute(f"SELECT id, title, notebook_id, created_at, updated_at FROM pages WHERE {where} "
                            "ORDER BY updated_at DESC, created_at DESC", args).fetchall()
    return [dict(row) for row in rows]


def rename(page_id: str, title: str | None) -> dict[str, object]:
    name = _title(title)
    with storage.connect() as conn:
        _active(conn, page_id)
        conn.execute("UPDATE pages SET title = ?, updated_at = ? WHERE id = ?", (name, _stamp(), page_id))
        return dict(_active(conn, page_id))


def save(page_id: str, markdown: str, expected_revision: int, todo_dates: dict | None = None) -> dict[str, object]:
    """Save a whole document with optimistic revision protection, as notes.save does."""
    _check_markdown(markdown)
    if expected_revision < 0:
        raise ValueError("Invalid page revision")
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = _active(conn, page_id)
        if int(row["revision"]) != expected_revision:
            raise RuntimeError("Notes changed in another tab")
        markdown = todos.reindex(conn, "page", page_id, markdown, todo_dates)
        conn.execute("UPDATE pages SET markdown = ?, revision = ?, updated_at = ? WHERE id = ?",
                     (markdown, expected_revision + 1, _stamp(), page_id))
        return dict(_active(conn, page_id))


def assign_notebook(page_id: str, notebook_id: str | None) -> dict[str, object]:
    with storage.connect() as conn:
        _check_notebook(conn, notebook_id)
        _active(conn, page_id)
        conn.execute("UPDATE pages SET notebook_id = ? WHERE id = ?", (notebook_id, page_id))
    return {"id": page_id, "notebook_id": notebook_id}


def move_to_trash(page_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        changed = conn.execute("UPDATE pages SET trashed_at = ? WHERE id = ? AND trashed_at IS NULL",
                               (_stamp(), page_id)).rowcount
    if not changed:
        raise LookupError("Page not found")
    return {"id": page_id, "trashed": True}


def trashed() -> list[dict[str, object]]:
    with storage.connect() as conn:
        rows = conn.execute("SELECT id, title, notebook_id, created_at, updated_at, trashed_at FROM pages "
                            "WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC").fetchall()
    return [dict(row) for row in rows]


def restore(page_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        changed = conn.execute("UPDATE pages SET trashed_at = NULL WHERE id = ? AND trashed_at IS NOT NULL", (page_id,)).rowcount
    if not changed:
        raise LookupError("Page not found in Recently Deleted")
    return {"id": page_id, "trashed": False}


def delete_permanently(page_id: str, *, expired_before: str | None = None) -> dict[str, object]:
    with storage.connect() as conn:
        deleted = conn.execute("DELETE FROM pages WHERE id = ? AND trashed_at IS NOT NULL AND (? IS NULL OR trashed_at <= ?)",
                               (page_id, expired_before, expired_before)).rowcount
        if deleted:
            todos.delete_source(conn, "page", page_id)
            suggestions.delete_source(conn, "page", page_id)
    if not deleted:
        raise LookupError("Page not found in Recently Deleted")
    return {"id": page_id, "deleted": True}


def delete_expired(cutoff: str) -> list[str]:
    with storage.connect() as conn:
        ids = [str(row["id"]) for row in conn.execute(
            "SELECT id FROM pages WHERE trashed_at IS NOT NULL AND trashed_at <= ?", (cutoff,))]
        conn.execute("DELETE FROM pages WHERE trashed_at IS NOT NULL AND trashed_at <= ?", (cutoff,))
        for page_id in ids:
            todos.delete_source(conn, "page", page_id)
            suggestions.delete_source(conn, "page", page_id)
    return ids


def by_notebook() -> dict[str, list[dict[str, object]]]:
    """Active pages grouped by notebook ID, newest first, for notebook listings."""
    with storage.connect() as conn:
        rows = conn.execute("SELECT id, title, updated_at, notebook_id FROM pages "
                            "WHERE notebook_id IS NOT NULL AND trashed_at IS NULL ORDER BY updated_at DESC").fetchall()
    groups: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        groups.setdefault(str(row["notebook_id"]), []).append({key: row[key] for key in ("id", "title", "updated_at")})
    return groups
