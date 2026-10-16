"""Local persistence for imported conversations."""

from __future__ import annotations

import os
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
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
            vocabulary_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(conversation_id, pipeline_version)
        )"""
    )
    job_columns = {row["name"] for row in conn.execute("PRAGMA table_info(processing_jobs)")}
    if "vocabulary_json" not in job_columns:
        conn.execute("ALTER TABLE processing_jobs ADD COLUMN vocabulary_json TEXT NOT NULL DEFAULT '[]'")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcripts (
            conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
            revision INTEGER NOT NULL,
            generation_version TEXT NOT NULL DEFAULT 'legacy',
            language TEXT NOT NULL,
            segments_json TEXT NOT NULL,
            turns_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    transcript_columns = {row["name"] for row in conn.execute("PRAGMA table_info(transcripts)")}
    if "generation_version" not in transcript_columns:
        conn.execute("ALTER TABLE transcripts ADD COLUMN generation_version TEXT NOT NULL DEFAULT 'legacy'")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcript_generations (
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            pipeline_version TEXT NOT NULL,
            revision INTEGER NOT NULL,
            language TEXT NOT NULL,
            segments_json TEXT NOT NULL,
            turns_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(conversation_id, pipeline_version)
        )"""
    )
    if conn.execute("SELECT 1 FROM transcript_generations LIMIT 1").fetchone() is None:
        conn.execute(
            """INSERT OR IGNORE INTO transcript_generations
               (conversation_id, pipeline_version, revision, language, segments_json, turns_json, created_at)
               SELECT conversation_id, generation_version, revision, language, segments_json, turns_json, updated_at
               FROM transcripts"""
        )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcript_edits (
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            segment_id TEXT NOT NULL,
            text TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(conversation_id, segment_id)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcript_edit_events (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            segment_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            old_text TEXT NOT NULL,
            new_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS speaker_labels (
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            scope TEXT NOT NULL CHECK (scope IN ('cluster', 'segment')),
            target_id TEXT NOT NULL,
            name TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(conversation_id, scope, target_id)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS speaker_label_events (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            scope TEXT NOT NULL,
            target_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            old_name TEXT,
            new_name TEXT,
            created_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS vocabulary (
            id TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            normalized TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transcript_highlights (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            segment_id TEXT NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            quote TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"""
    )
    conn.commit()
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


def get_latest_job_for_conversation(conversation_id: str) -> dict[str, object] | None:
    """Find the newest job, including one with an older vocabulary snapshot."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM processing_jobs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
            (conversation_id,),
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
                metrics_json, vocabulary_json, created_at, updated_at)
               VALUES (:id, :conversation_id, :pipeline_version, :state, :stage, :progress,
                       :error, :metrics_json, :vocabulary_json, :created_at, :updated_at)""",
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
    """Activate a generation while retaining prior machine output and edits."""
    version = str(record.get("pipeline_version", "legacy"))
    stamp = str(record["updated_at"])
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        old = conn.execute("SELECT * FROM transcripts WHERE conversation_id = ?",
                           (record["conversation_id"],)).fetchone()
        if old is not None:
            conn.execute(
                """INSERT OR IGNORE INTO transcript_generations
                   (conversation_id, pipeline_version, revision, language, segments_json, turns_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (old["conversation_id"], old["generation_version"], old["revision"],
                 old["language"], old["segments_json"], old["turns_json"], old["updated_at"]),
            )
            revision = int(old["revision"]) + 1
        else:
            revision = int(record["revision"])
        conn.execute(
            """INSERT OR IGNORE INTO transcript_generations
               (conversation_id, pipeline_version, revision, language, segments_json, turns_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (record["conversation_id"], version, revision, record["language"],
             record["segments_json"], record["turns_json"], stamp),
        )
        conn.execute(
            """INSERT INTO transcripts
               (conversation_id, revision, generation_version, language, segments_json, turns_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(conversation_id) DO UPDATE SET
                 revision = excluded.revision, generation_version = excluded.generation_version,
                 language = excluded.language,
                 segments_json = excluded.segments_json, turns_json = excluded.turns_json,
                 updated_at = excluded.updated_at""",
            (record["conversation_id"], revision, version, record["language"],
             record["segments_json"], record["turns_json"], stamp),
        )


def get_transcript(conversation_id: str) -> dict[str, object] | None:
    """Return stored transcript data without exposing the database layout."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM transcripts WHERE conversation_id = ?", (conversation_id,)).fetchone()
    return dict(row) if row else None


def list_transcript_generations(conversation_id: str) -> list[dict[str, object]]:
    """Expose metadata about retained machine outputs, oldest first."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT pipeline_version, revision, language, created_at
               FROM transcript_generations WHERE conversation_id = ? ORDER BY created_at""",
            (conversation_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_transcript_generation(conversation_id: str, version: str) -> dict[str, object] | None:
    """Return one immutable machine-output generation."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM transcript_generations WHERE conversation_id = ? AND pipeline_version = ?",
            (conversation_id, version),
        ).fetchone()
    return dict(row) if row else None


def get_transcript_edits(conversation_id: str) -> dict[str, str]:
    """Return user text overrides keyed by stable segment ID."""
    with connect() as conn:
        rows = conn.execute("SELECT segment_id, text FROM transcript_edits WHERE conversation_id = ?",
                            (conversation_id,)).fetchall()
    return {str(row["segment_id"]): str(row["text"]) for row in rows}


def get_speaker_labels(conversation_id: str) -> list[dict[str, object]]:
    """Return user-confirmed cluster and segment labels."""
    with connect() as conn:
        rows = conn.execute("SELECT scope, target_id, name, updated_at FROM speaker_labels WHERE conversation_id = ?",
                            (conversation_id,)).fetchall()
    return [dict(row) for row in rows]


def list_highlights(conversation_id: str) -> list[dict[str, object]]:
    """Return selected transcript excerpts in creation order."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT id, segment_id, start_offset, end_offset, quote, created_at
               FROM transcript_highlights WHERE conversation_id = ? ORDER BY created_at, id""",
            (conversation_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_highlight(conversation_id: str, segment_id: str, start_offset: int,
                  end_offset: int, expected_revision: int) -> dict[str, object]:
    """Anchor a selected excerpt to the current displayed segment text."""
    stamp = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision, segments_json FROM transcripts WHERE conversation_id = ?",
                           (conversation_id,)).fetchone()
        if row is None:
            raise LookupError("Transcript not found")
        if int(row["revision"]) != expected_revision:
            raise RuntimeError("Transcript changed. Reload and try again.")
        segment = next((item for item in json.loads(str(row["segments_json"]))
                        if item["id"] == segment_id), None)
        if segment is None:
            raise LookupError("Segment not found")
        edit = conn.execute("SELECT text FROM transcript_edits WHERE conversation_id = ? AND segment_id = ?",
                            (conversation_id, segment_id)).fetchone()
        displayed = str(edit["text"]) if edit else str(segment["text"])
        if start_offset < 0 or end_offset > len(displayed) or start_offset >= end_offset:
            raise ValueError("Select text within one passage")
        record = {"id": str(uuid.uuid4()), "segment_id": segment_id,
                  "start_offset": start_offset, "end_offset": end_offset,
                  "quote": displayed[start_offset:end_offset], "created_at": stamp}
        conn.execute(
            """INSERT INTO transcript_highlights
               (id, conversation_id, segment_id, start_offset, end_offset, quote, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (record["id"], conversation_id, segment_id, start_offset, end_offset,
             record["quote"], stamp),
        )
    return record


def delete_highlight(conversation_id: str, highlight_id: str) -> bool:
    """Remove one highlight without altering the transcript."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM transcript_highlights WHERE conversation_id = ? AND id = ?",
                              (conversation_id, highlight_id))
    return cursor.rowcount > 0


def edit_transcript_segment(conversation_id: str, segment_id: str, text: str,
                            expected_revision: int) -> int:
    """Apply an optimistic text edit while preserving model text and edit history."""
    stamp = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision, segments_json FROM transcripts WHERE conversation_id = ?",
                           (conversation_id,)).fetchone()
        if row is None:
            raise LookupError("Transcript not found")
        if int(row["revision"]) != expected_revision:
            raise RuntimeError("Transcript changed. Reload and try again.")
        segments = json.loads(str(row["segments_json"]))
        segment = next((item for item in segments if item["id"] == segment_id), None)
        if segment is None:
            raise LookupError("Segment not found")
        old = conn.execute("SELECT text FROM transcript_edits WHERE conversation_id = ? AND segment_id = ?",
                           (conversation_id, segment_id)).fetchone()
        old_text = str(old["text"]) if old else str(segment["text"])
        if text == old_text:
            return expected_revision
        if text == segment["text"]:
            conn.execute("DELETE FROM transcript_edits WHERE conversation_id = ? AND segment_id = ?",
                         (conversation_id, segment_id))
        else:
            conn.execute(
                """INSERT INTO transcript_edits (conversation_id, segment_id, text, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(conversation_id, segment_id) DO UPDATE SET
                   text = excluded.text, updated_at = excluded.updated_at""",
                (conversation_id, segment_id, text, stamp),
            )
        revision = expected_revision + 1
        conn.execute("UPDATE transcripts SET revision = ?, updated_at = ? WHERE conversation_id = ?",
                     (revision, stamp, conversation_id))
        conn.execute(
            """INSERT INTO transcript_edit_events
               (id, conversation_id, segment_id, revision, old_text, new_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), conversation_id, segment_id, revision, old_text, text, stamp),
        )
    return revision


def set_speaker_label(conversation_id: str, scope: str, target_id: str,
                      name: str | None, expected_revision: int) -> int:
    """Set or clear a manual speaker label without touching acoustic clusters."""
    if scope not in {"cluster", "segment"}:
        raise ValueError("Invalid speaker label scope")
    stamp = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT revision, segments_json FROM transcripts WHERE conversation_id = ?",
                           (conversation_id,)).fetchone()
        if row is None:
            raise LookupError("Transcript not found")
        if int(row["revision"]) != expected_revision:
            raise RuntimeError("Transcript changed. Reload and try again.")
        segments = json.loads(str(row["segments_json"]))
        targets = {item["id"] if scope == "segment" else item["speaker_cluster_id"] for item in segments}
        if target_id not in targets or target_id is None:
            raise LookupError("Speaker target not found")
        old = conn.execute(
            "SELECT name FROM speaker_labels WHERE conversation_id = ? AND scope = ? AND target_id = ?",
            (conversation_id, scope, target_id),
        ).fetchone()
        old_name = str(old["name"]) if old else None
        if name == old_name:
            return expected_revision
        if name is None:
            conn.execute("DELETE FROM speaker_labels WHERE conversation_id = ? AND scope = ? AND target_id = ?",
                         (conversation_id, scope, target_id))
        else:
            conn.execute(
                """INSERT INTO speaker_labels (conversation_id, scope, target_id, name, updated_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(conversation_id, scope, target_id) DO UPDATE SET
                   name = excluded.name, updated_at = excluded.updated_at""",
                (conversation_id, scope, target_id, name, stamp),
            )
        revision = expected_revision + 1
        conn.execute("UPDATE transcripts SET revision = ?, updated_at = ? WHERE conversation_id = ?",
                     (revision, stamp, conversation_id))
        conn.execute(
            """INSERT INTO speaker_label_events
               (id, conversation_id, scope, target_id, revision, old_name, new_name, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), conversation_id, scope, target_id, revision, old_name, name, stamp),
        )
    return revision


def list_vocabulary() -> list[dict[str, object]]:
    """List user-provided ASR hints in stable order."""
    with connect() as conn:
        rows = conn.execute("SELECT id, term, created_at, updated_at FROM vocabulary ORDER BY normalized").fetchall()
    return [dict(row) for row in rows]


def add_vocabulary(term: str) -> dict[str, object]:
    """Add one unique vocabulary hint."""
    stamp = datetime.now(timezone.utc).isoformat()
    record = {"id": str(uuid.uuid4()), "term": term, "normalized": term.casefold(),
              "created_at": stamp, "updated_at": stamp}
    with connect() as conn:
        conn.execute("INSERT INTO vocabulary (id, term, normalized, created_at, updated_at) VALUES (:id, :term, :normalized, :created_at, :updated_at)", record)
    return {key: record[key] for key in ("id", "term", "created_at", "updated_at")}


def update_vocabulary(term_id: str, term: str) -> dict[str, object] | None:
    """Rename a vocabulary hint without changing its ID."""
    stamp = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        cursor = conn.execute("UPDATE vocabulary SET term = ?, normalized = ?, updated_at = ? WHERE id = ?",
                              (term, term.casefold(), stamp, term_id))
        if cursor.rowcount == 0:
            return None
        row = conn.execute("SELECT id, term, created_at, updated_at FROM vocabulary WHERE id = ?",
                           (term_id,)).fetchone()
    return dict(row)


def delete_vocabulary(term_id: str) -> bool:
    """Remove a vocabulary hint; existing transcripts are unaffected."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM vocabulary WHERE id = ?", (term_id,))
    return cursor.rowcount > 0
