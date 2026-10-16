"""Development identity store for the separate sync origin; no content records."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

COOKIE = "stellis_sync_session"
SESSION_DAYS = 7


def root() -> Path:
    configured = os.environ.get("STELLIS_SYNC_DATA_DIR")
    path = Path(configured).expanduser() if configured else Path.home() / "Library/Application Support/Stellis Sync Dev"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)
    return path


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = root() / "identity.sqlite3"
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt BLOB NOT NULL,
        verifier BLOB NOT NULL, created_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token_hash BLOB PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        expires_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
    )""")
    conn.commit()
    path.chmod(0o600)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _verifier(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode("ascii")).digest()


def register(username: str, password: str) -> str:
    username = username.strip()
    if not 3 <= len(username) <= 80 or not 12 <= len(password) <= 1024:
        raise ValueError("Use a username of 3–80 characters and a password of at least 12 characters")
    user_id = str(uuid.uuid4())
    with connect() as conn:
        try:
            conn.execute("INSERT INTO users VALUES (?, ?, ?, ?, ?)",
                         (user_id, username, salt := secrets.token_bytes(32), _verifier(password, salt), _now()))
        except sqlite3.IntegrityError as exc:
            raise RuntimeError("Username unavailable") from exc
    return user_id


def login(username: str, password: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT id, salt, verifier FROM users WHERE username = ?", (username,)).fetchone()
    # Keep the response and expensive verifier work the same for unknown users.
    salt = row["salt"] if row else b"\0" * 32
    verifier = row["verifier"] if row else b"\0" * 32
    if not hmac.compare_digest(verifier, _verifier(password, salt)) or row is None:
        return None
    return str(row["id"])


def new_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (_now(),))
        conn.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                     (_digest(token), user_id, (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()))
    return token


def current_user(token: str | None) -> dict[str, str] | None:
    if not token:
        return None
    try:
        digest = _digest(token)
    except UnicodeEncodeError:
        return None
    with connect() as conn:
        row = conn.execute("""SELECT users.id, users.username FROM users JOIN sessions
            ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
            (digest, _now())).fetchone()
    return {"id": row["id"], "username": row["username"]} if row else None


def revoke(token: str | None) -> None:
    if token:
        try:
            digest = _digest(token)
        except UnicodeEncodeError:
            return
        with connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))


def revoke_all(user_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def devices(user_id: str) -> list[dict[str, str]]:
    with connect() as conn:
        rows = conn.execute("SELECT id, name, created_at FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at",
                            (user_id,)).fetchall()
    return [dict(row) for row in rows]


def add_device(user_id: str, name: str) -> dict[str, str]:
    name = name.strip()
    if not name or len(name) > 100:
        raise ValueError("Enter a device name")
    record = {"id": str(uuid.uuid4()), "name": name, "created_at": _now()}
    with connect() as conn:
        conn.execute("INSERT INTO devices VALUES (?, ?, ?, ?, NULL)",
                     (record["id"], user_id, name, record["created_at"]))
    return record


def revoke_device(user_id: str, device_id: str) -> bool:
    with connect() as conn:
        result = conn.execute("UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
                              (_now(), device_id, user_id))
    return result.rowcount == 1
