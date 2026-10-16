"""Local persistence for imported conversations."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


def data_dir() -> Path:
    """Return the private local data directory, creating it when needed."""
    configured = os.environ.get("STELLIS_DATA_DIR")
    root = Path(configured).expanduser() if configured else Path.home() / "Library/Application Support/Stellis"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    return root


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open and close a transaction with the current schema."""
    database = data_dir() / "stellis.sqlite3"
    conn = sqlite3.connect(database, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_sha256 TEXT NOT NULL UNIQUE,
            audio_filename TEXT NOT NULL,
            audio_media_type TEXT NOT NULL,
            duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
            created_at TEXT NOT NULL
        )
        """
    )
    database.chmod(0o600)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def list_conversations() -> list[dict[str, object]]:
    """List local conversations with stable ordering."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, title, duration_ms, created_at FROM conversations ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversation(conversation_id: str) -> dict[str, object] | None:
    """Return one conversation or None when it is absent."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return dict(row) if row else None


def find_by_hash(source_sha256: str) -> dict[str, object] | None:
    """Find a previously imported audio file by content digest."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM conversations WHERE source_sha256 = ?", (source_sha256,)
        ).fetchone()
    return dict(row) if row else None


def add_conversation(record: dict[str, object]) -> None:
    """Insert a validated import record."""
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO conversations
                (id, title, source_sha256, audio_filename, audio_media_type, duration_ms, created_at)
            VALUES (:id, :title, :source_sha256, :audio_filename,
                    :audio_media_type, :duration_ms, :created_at)
            """,
            record,
        )
