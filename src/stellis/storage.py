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
    conn.execute(
        """CREATE TABLE IF NOT EXISTS processing_jobs (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            pipeline_version TEXT NOT NULL,
            state TEXT NOT NULL,
            stage TEXT NOT NULL,
            progress REAL NOT NULL,
            error TEXT,
            metrics_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(conversation_id, pipeline_version)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcripts (
            conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
            revision INTEGER NOT NULL,
            language TEXT NOT NULL,
            segments_json TEXT NOT NULL,
            turns_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
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


def get_job(job_id: str) -> dict[str, object] | None:
    """Return a persisted processing job."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM processing_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def get_job_for_conversation(conversation_id: str, pipeline_version: str) -> dict[str, object] | None:
    """Find the idempotent job for a recording and pipeline version."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM processing_jobs WHERE conversation_id = ? AND pipeline_version = ?",
            (conversation_id, pipeline_version),
        ).fetchone()
    return dict(row) if row else None


def list_pending_jobs() -> list[dict[str, object]]:
    """Find unfinished work after a device-service restart."""
    with connect() as conn:
        rows = conn.execute("SELECT * FROM processing_jobs WHERE state IN ('queued', 'running')").fetchall()
    return [dict(row) for row in rows]


def add_job(record: dict[str, object]) -> None:
    """Persist a newly queued job."""
    with connect() as conn:
        conn.execute(
            """INSERT INTO processing_jobs
               (id, conversation_id, pipeline_version, state, stage, progress, error,
                metrics_json, created_at, updated_at)
               VALUES (:id, :conversation_id, :pipeline_version, :state, :stage, :progress,
                       :error, :metrics_json, :created_at, :updated_at)""",
            record,
        )


def update_job(job_id: str, **fields: object) -> None:
    """Update only known job fields."""
    allowed = {"state", "stage", "progress", "error", "metrics_json", "updated_at"}
    if not fields.keys() <= allowed:
        raise ValueError("Unknown job field")
    assignments = ", ".join(f"{key} = ?" for key in fields)
    with connect() as conn:
        conn.execute(
            f"UPDATE processing_jobs SET {assignments} WHERE id = ?",
            (*fields.values(), job_id),
        )


def save_transcript(record: dict[str, object]) -> None:
    """Store a generated transcript atomically for a conversation."""
    with connect() as conn:
        conn.execute(
            """INSERT INTO transcripts
               (conversation_id, revision, language, segments_json, turns_json, updated_at)
               VALUES (:conversation_id, :revision, :language, :segments_json,
                       :turns_json, :updated_at)
               ON CONFLICT(conversation_id) DO UPDATE SET
                 revision = excluded.revision, language = excluded.language,
                 segments_json = excluded.segments_json, turns_json = excluded.turns_json,
                 updated_at = excluded.updated_at""",
            record,
        )


def get_transcript(conversation_id: str) -> dict[str, object] | None:
    """Return stored transcript data without exposing the database layout."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM transcripts WHERE conversation_id = ?", (conversation_id,)).fetchone()
    return dict(row) if row else None
