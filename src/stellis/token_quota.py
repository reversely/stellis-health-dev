"""Daily Token Factory allowance for accounts that use the deployment's shared keys.

Each account's database keeps a per-day token total from the usage fields that
Token Factory returns. Callers check the allowance before a request, so an account
over its limit makes no provider call. The owner and accounts with their own keys
have no limit.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from stellis import runtime_profile, storage

MESSAGE = "Today's AI allowance is used up and resets at midnight UTC"


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def limit() -> int | None:
    """Return this account's daily token limit, or None when it has none."""
    if runtime_profile.local_inference() or runtime_profile.operator():
        return None
    value = os.environ.get("STELLIS_DAILY_TOKEN_LIMIT", "").strip()
    return int(value) if value.isdigit() and int(value) > 0 else None


def _table(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS token_usage (day TEXT PRIMARY KEY, tokens INTEGER NOT NULL)")


def used_today() -> int:
    with storage.connect() as conn:
        _table(conn)
        row = conn.execute("SELECT tokens FROM token_usage WHERE day = ?", (_today(),)).fetchone()
    return int(row[0]) if row else 0


def exceeded() -> str | None:
    """Return the user-facing message when today's allowance is used up, else None."""
    allowed = limit()
    return MESSAGE if allowed is not None and used_today() >= allowed else None


def _total(usage: object) -> int:
    if not isinstance(usage, dict):
        return 0
    def number(key):
        value = usage.get(key)
        return value if type(value) is int and value >= 0 else 0
    for key in ("total_tokens", "total"):
        if number(key):
            return number(key)
    return number("prompt_tokens") + number("completion_tokens") or number("input") + number("output")


def record(usage: object) -> None:
    """Add one response's token count to today's total."""
    tokens = _total(usage)
    if not tokens:
        return
    with storage.connect() as conn:
        _table(conn)
        conn.execute("""INSERT INTO token_usage (day, tokens) VALUES (?, ?)
            ON CONFLICT(day) DO UPDATE SET tokens = tokens + excluded.tokens""", (_today(), tokens))
