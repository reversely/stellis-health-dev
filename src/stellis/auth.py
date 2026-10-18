"""Single-account session gate for the loopback development service."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
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


def dev_enabled() -> bool:
    return os.environ.get("STELLIS_DEV_ACCOUNT") == "1" and bool(os.environ.get("STELLIS_DEV_PASSWORD"))


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = storage.data_dir() / "auth.sqlite3"
    conn = sqlite3.connect(path, timeout=30, factory=storage.TolerantConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY CHECK(id = 1), username TEXT NOT NULL UNIQUE,
        salt BLOB NOT NULL, verifier BLOB NOT NULL, created_at TEXT NOT NULL
    )""")
    account_columns = {row["name"] for row in conn.execute("PRAGMA table_info(account)")}
    for column in ("name", "email"):
        if column not in account_columns:
            conn.execute(f"ALTER TABLE account ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token_hash BLOB PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account(id),
        expires_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS dev_sessions (
        token_hash BLOB PRIMARY KEY, expires_at TEXT NOT NULL
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
    if dev_enabled() and username == "dev" and hmac.compare_digest(password, os.environ["STELLIS_DEV_PASSWORD"]):
        token = secrets.token_urlsafe(32)
        expiry = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
        with _connect() as conn:
            conn.execute("INSERT INTO dev_sessions (token_hash, expires_at) VALUES (?, ?)",
                         (_token_hash(token), expiry))
        return token
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
        if row is None and dev_enabled():
            dev = conn.execute("SELECT 1 FROM dev_sessions WHERE token_hash = ? AND expires_at > ?",
                               (digest, datetime.now(timezone.utc).isoformat())).fetchone()
            if dev:
                return "dev"
    return str(row["username"]) if row else None


def revoke(token: str | None) -> None:
    if token:
        try:
            digest = _token_hash(token)
        except UnicodeEncodeError:
            return
        with _connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
            conn.execute("DELETE FROM dev_sessions WHERE token_hash = ?", (digest,))


def _check_password(conn: sqlite3.Connection, password: str) -> None:
    row = conn.execute("SELECT salt, verifier FROM account WHERE id = 1").fetchone()
    if row is None:
        raise LookupError("Account not found")
    if not hmac.compare_digest(row["verifier"], _verifier(password, row["salt"])):
        raise PermissionError("Your current password is incorrect")


def profile() -> dict[str, str]:
    with _connect() as conn:
        row = conn.execute("SELECT username, name, email FROM account WHERE id = 1").fetchone()
    if row is None:
        raise LookupError("Account not found")
    return {"username": row["username"], "name": row["name"], "email": row["email"]}


def update_profile(name: str, email: str) -> dict[str, str]:
    name, email = " ".join(name.split()), email.strip()
    if len(name) > 100:
        raise ValueError("Your name must be at most 100 characters")
    if email and (len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)):
        raise ValueError("Enter an email address like name@example.com")
    with _connect() as conn:
        if not conn.execute("UPDATE account SET name = ?, email = ? WHERE id = 1", (name, email)).rowcount:
            raise LookupError("Account not found")
    return profile()


def change_username(username: str, password: str) -> dict[str, str]:
    username = username.strip()
    if not 3 <= len(username) <= 80:
        raise ValueError("Use a username of 3–80 characters")
    with _connect() as conn:
        _check_password(conn, password)
        conn.execute("UPDATE account SET username = ? WHERE id = 1", (username,))
    return profile()


def change_password(current: str, new: str, keep_token: str | None) -> None:
    """Replace the verifier and sign out every other session."""
    if len(new) < 12 or len(new) > 1024:
        raise ValueError("Your new password must be at least 12 characters")
    salt = secrets.token_bytes(32)
    with _connect() as conn:
        _check_password(conn, current)
        conn.execute("UPDATE account SET salt = ?, verifier = ? WHERE id = 1", (salt, _verifier(new, salt)))
        keep = _token_hash(keep_token) if keep_token else b""
        conn.execute("DELETE FROM sessions WHERE token_hash != ?", (keep,))


def verify_password(password: str) -> None:
    with _connect() as conn:
        _check_password(conn, password)


def delete_account() -> None:
    """Remove the sign-in and every session; the next visit offers Sign up."""
    with _connect() as conn:
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM dev_sessions")
        conn.execute("DELETE FROM account")
