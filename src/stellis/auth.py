"""Single-account session gate for the loopback development service."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator

from stellis import storage

SESSION_DAYS = 7
COOKIE_NAME = "stellis_session"


def enabled() -> bool:
    return os.environ.get("STELLIS_AUTH_MODE") == "required"


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = storage.data_dir() / "auth.sqlite3"
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY CHECK(id = 1), username TEXT NOT NULL UNIQUE,
        salt BLOB NOT NULL, verifier BLOB NOT NULL, created_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token_hash BLOB PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account(id),
        expires_at TEXT NOT NULL
    )""")
    conn.commit()
    path.chmod(0o600)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _verifier(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)


def _token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode("ascii")).digest()


def has_account() -> bool:
    with _connect() as conn:
        return conn.execute("SELECT 1 FROM account WHERE id = 1").fetchone() is not None


def register(username: str, password: str) -> str:
    username = username.strip()
    if not 3 <= len(username) <= 80 or len(password) < 12 or len(password) > 1024:
        raise ValueError("Use a username of 3–80 characters and a password of at least 12 characters")
    salt = secrets.token_bytes(32)
    stamp = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        try:
            conn.execute("INSERT INTO account (id, username, salt, verifier, created_at) VALUES (1, ?, ?, ?, ?)",
                         (username, salt, _verifier(password, salt), stamp))
        except sqlite3.IntegrityError as exc:
            raise RuntimeError("Account already exists") from exc
    return username


def login(username: str, password: str) -> str | None:
    with _connect() as conn:
        row = conn.execute("SELECT username, salt, verifier FROM account WHERE id = 1").fetchone()
    if row is None:
        return None
    candidate = _verifier(password, row["salt"])
    if not hmac.compare_digest(row["verifier"], candidate) or row["username"] != username:
        return None
    return create_session()


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (datetime.now(timezone.utc).isoformat(),))
        conn.execute("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, 1, ?)",
                     (_token_hash(token), expiry))
    return token


def current_account(token: str | None) -> str | None:
    if not token:
        return None
    try:
        digest = _token_hash(token)
    except UnicodeEncodeError:
        return None
    with _connect() as conn:
        row = conn.execute("""SELECT account.username FROM sessions JOIN account ON account.id = sessions.account_id
            WHERE token_hash = ? AND expires_at > ?""", (digest, datetime.now(timezone.utc).isoformat())).fetchone()
    return str(row["username"]) if row else None


def revoke(token: str | None) -> None:
    if token:
        try:
            digest = _token_hash(token)
        except UnicodeEncodeError:
            return
        with _connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
