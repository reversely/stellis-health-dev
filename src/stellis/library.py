"""Categories and reversible local conversation removal."""

from __future__ import annotations

import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from stellis import storage

_LOCK = threading.Lock()
RETENTION_DAYS = 30


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def expires_at(trashed_at: str) -> str:
    return (datetime.fromisoformat(trashed_at) + timedelta(days=RETENTION_DAYS)).isoformat()


def categories() -> list[dict[str, object]]:
    with storage.connect() as conn:
        rows = conn.execute("""SELECT c.id, c.name, COUNT(v.id) AS conversation_count
            FROM categories c LEFT JOIN conversation_categories cc ON cc.category_id = c.id
            LEFT JOIN conversations v ON v.id = cc.conversation_id AND v.trashed_at IS NULL
            GROUP BY c.id ORDER BY c.name COLLATE NOCASE""").fetchall()
    return [dict(row) for row in rows]


def assignments(conversation_id: str | None = None) -> dict[str, list[str]]:
    with storage.connect() as conn:
        rows = conn.execute("SELECT conversation_id, category_id FROM conversation_categories" +
                            (" WHERE conversation_id = ?" if conversation_id else ""),
                            (conversation_id,) if conversation_id else ()).fetchall()
    result: dict[str, list[str]] = {}
    for row in rows:
        result.setdefault(str(row["conversation_id"]), []).append(str(row["category_id"]))
    return result


def create_category(name: str) -> dict[str, object]:
    value = name.strip()
    if not value or len(value) > 80:
        raise ValueError("Enter a category name of at most 80 characters")
    result = {"id": str(uuid.uuid4()), "name": value, "created_at": _now()}
    try:
        with storage.connect() as conn:
            conn.execute("INSERT INTO categories (id, name, normalized, created_at) VALUES (?, ?, ?, ?)",
                         (result["id"], value, value.casefold(), result["created_at"]))
    except sqlite3.IntegrityError as exc:
        raise ValueError("That category already exists") from exc
    return result


def rename_category(category_id: str, name: str) -> dict[str, object]:
    value = name.strip()
    if not value or len(value) > 80:
        raise ValueError("Enter a category name of at most 80 characters")
    try:
        with storage.connect() as conn:
            changed = conn.execute("UPDATE categories SET name = ?, normalized = ? WHERE id = ?",
                                   (value, value.casefold(), category_id)).rowcount
    except sqlite3.IntegrityError as exc:
        raise ValueError("That category already exists") from exc
    if not changed:
        raise LookupError("Category not found")
    return {"id": category_id, "name": value}


def delete_category(category_id: str) -> bool:
    with storage.connect() as conn:
        conn.execute("DELETE FROM conversation_categories WHERE category_id = ?", (category_id,))
        return bool(conn.execute("DELETE FROM categories WHERE id = ?", (category_id,)).rowcount)


def set_category(conversation_id: str, category_id: str, assigned: bool) -> list[str]:
    with storage.connect() as conn:
        if not conn.execute("SELECT 1 FROM conversations WHERE id = ? AND trashed_at IS NULL", (conversation_id,)).fetchone():
            raise LookupError("Conversation not found")
        if not conn.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone():
            raise LookupError("Category not found")
        if assigned:
            conn.execute("INSERT OR IGNORE INTO conversation_categories VALUES (?, ?)",
                         (conversation_id, category_id))
        else:
            conn.execute("DELETE FROM conversation_categories WHERE conversation_id = ? AND category_id = ?",
                         (conversation_id, category_id))
    return assignments(conversation_id).get(conversation_id, [])


def move_to_trash(conversation_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        changed = conn.execute("UPDATE conversations SET trashed_at = ? WHERE id = ? AND trashed_at IS NULL",
                               (_now(), conversation_id)).rowcount
    if not changed:
        raise LookupError("Conversation not found")
    return {"id": conversation_id, "trashed": True}


def restore(conversation_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        changed = conn.execute("UPDATE conversations SET trashed_at = NULL WHERE id = ? AND trashed_at IS NOT NULL",
                               (conversation_id,)).rowcount
    if not changed:
        raise LookupError("Conversation not found in Recently Deleted")
    return {"id": conversation_id, "trashed": False}


def recover_staged_media() -> None:
    """Finish or roll back media staging after an interrupted permanent delete."""
    media_dir = storage.data_dir() / "media"
    if not media_dir.exists():
        return
    for staged in media_dir.glob(".deleting-*"):
        parts = staged.name.split("-")
        if len(parts) < 7:
            continue
        try:
            conversation_id = str(uuid.UUID("-".join(parts[1:6])))
        except ValueError:
            # Filename format is .deleting-<UUID>-<random>; unknown files stay untouched.
            continue
        record = storage.get_conversation(conversation_id, include_trashed=True)
        if record is None:
            staged.unlink(missing_ok=True)
        else:
            filename = str(record["audio_filename"])
            if Path(filename).name != filename:
                continue
            destination = media_dir / filename
            if destination.exists():
                staged.unlink(missing_ok=True)
            else:
                staged.rename(destination)


def delete_permanently(conversation_id: str, *, expired_before: str | None = None) -> dict[str, object]:
    """Remove a trashed item only after its device and AI jobs have settled."""
    with _LOCK:
        with storage.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("""SELECT audio_filename FROM conversations
                WHERE id = ? AND trashed_at IS NOT NULL AND (? IS NULL OR trashed_at <= ?)""",
                (conversation_id, expired_before, expired_before)).fetchone()
            if row is None:
                raise LookupError("Conversation not found in Recently Deleted")
            for table in ("processing_jobs", "ai_runs", "clean_runs"):
                if conn.execute(f"SELECT 1 FROM {table} WHERE conversation_id = ? AND state IN ('queued', 'running') LIMIT 1",
                                (conversation_id,)).fetchone():
                    raise RuntimeError("Wait for this conversation's processing to finish before permanent deletion")
            filename = str(row["audio_filename"])
            if Path(filename).name != filename:
                raise RuntimeError("Stored media path is invalid")
            media = storage.data_dir() / "media" / filename
            staged = media.with_name(f".deleting-{conversation_id}-{uuid.uuid4().hex}")
            if media.exists():
                media.rename(staged)
            else:
                staged = None
            try:
                sessions = [str(item["id"]) for item in conn.execute(
                    "SELECT id FROM recording_sessions WHERE conversation_id = ?", (conversation_id,))]
                job_ids = [str(item["id"]) for item in conn.execute(
                    "SELECT id FROM processing_jobs WHERE conversation_id = ?", (conversation_id,))]
                conn.execute("DELETE FROM clean_transcript_edits WHERE run_id IN (SELECT id FROM clean_runs WHERE conversation_id = ?)", (conversation_id,))
                conn.execute("DELETE FROM clean_run_reviews WHERE run_id IN (SELECT id FROM clean_runs WHERE conversation_id = ?)", (conversation_id,))
                for session_id in sessions:
                    conn.execute("DELETE FROM recording_chunks WHERE recording_id = ?", (session_id,))
                    conn.execute("DELETE FROM recording_events WHERE recording_id = ?", (session_id,))
                for table in ("recording_sessions", "clean_runs", "ai_runs", "transcript_highlights",
                              "speaker_label_events", "speaker_labels", "transcript_edit_events",
                              "transcript_edits", "transcript_generations", "transcripts", "processing_jobs",
                              "conversation_categories", "person_links"):
                    conn.execute(f"DELETE FROM {table} WHERE conversation_id = ?", (conversation_id,))
                conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
                conn.commit()
            except Exception:
                conn.rollback()
                if staged is not None:
                    staged.rename(media)
                raise
        if staged is not None:
            staged.unlink(missing_ok=True)
        for session_id in sessions:
            shutil.rmtree(storage.data_dir() / "recordings" / session_id, ignore_errors=True)
        for job_id in job_ids:
            (storage.data_dir() / "job-locks" / f"{job_id}.lock").unlink(missing_ok=True)
    return {"id": conversation_id, "deleted": True}


def delete_expired(*, now: datetime | None = None) -> dict[str, object]:
    """Sweep expired items; retry busy jobs during the next scheduled sweep."""
    cutoff = ((now or datetime.now(timezone.utc)).astimezone(timezone.utc) -
              timedelta(days=RETENTION_DAYS)).isoformat()
    with storage.connect() as conn:
        expired = [str(row["id"]) for row in conn.execute(
            "SELECT id FROM conversations WHERE trashed_at IS NOT NULL AND trashed_at <= ?",
            (cutoff,)).fetchall()]
    deleted, deferred = [], []
    for conversation_id in expired:
        try:
            delete_permanently(conversation_id, expired_before=cutoff)
            deleted.append(conversation_id)
        except LookupError:
            # Restored or moved to Recently Deleted again after the sweep query.
            continue
        except RuntimeError:
            deferred.append(conversation_id)
    return {"deleted": deleted, "deferred": deferred}
