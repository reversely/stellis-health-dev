"""Local agent identities, notebook assignments, memory, and Chat history."""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timezone

from stellis import storage


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _value(value: str, label: str, limit: int) -> str:
    cleaned = " ".join(value.split())
    if not cleaned or len(cleaned) > limit:
        raise ValueError(f"{label} must be 1–{limit} characters")
    return cleaned


def _default(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM agents WHERE is_default = 1").fetchone():
        return
    now = _now()
    conn.execute("""INSERT INTO agents
        (id, name, name_key, role, instructions, openclaw_id, is_default, created_at, updated_at)
        VALUES (?, 'General', 'general', 'General assistant', '', 'main', 1, ?, ?)""",
        (str(uuid.uuid4()), now, now))


def _record(conn: sqlite3.Connection, agent_id: str) -> dict[str, object]:
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if row is None:
        raise LookupError("Agent not found")
    assignments = [dict(item) for item in conn.execute("""SELECT an.notebook_id, n.name AS notebook_name,
        an.is_steward FROM agent_notebooks an JOIN notebooks n ON n.id = an.notebook_id
        WHERE an.agent_id = ? ORDER BY n.name COLLATE NOCASE""", (agent_id,))]
    return {**dict(row), "is_default": bool(row["is_default"]),
            "notebooks": [{**item, "is_steward": bool(item["is_steward"])} for item in assignments]}


def list_agents() -> list[dict[str, object]]:
    with storage.connect() as conn:
        _default(conn)
        ids = [str(row["id"]) for row in conn.execute("SELECT id FROM agents ORDER BY is_default DESC, name COLLATE NOCASE")]
        return [_record(conn, agent_id) for agent_id in ids]


def get(agent_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        _default(conn)
        return _record(conn, agent_id)


def create(name: str, role: str, instructions: str = "", notebook_id: str | None = None,
           steward: bool = False) -> dict[str, object]:
    name = _value(name, "Name", 80)
    role = _value(role, "Role", 160)
    instructions = instructions.strip()
    if len(instructions) > 4000:
        raise ValueError("Instructions must be at most 4000 characters")
    key = name.casefold()
    slug = re.sub(r"[^a-z0-9]+", "-", key).strip("-")[:24] or "agent"
    if slug == "main":
        slug = "agent-main"
    agent_id = str(uuid.uuid4())
    now = _now()
    with storage.connect() as conn:
        _default(conn)
        if conn.execute("SELECT 1 FROM agents WHERE name_key = ?", (key,)).fetchone():
            raise ValueError("An agent with this name already exists")
        base = slug
        suffix = 2
        while conn.execute("SELECT 1 FROM agents WHERE openclaw_id = ?", (slug,)).fetchone():
            slug = f"{base[:21]}-{suffix}"
            suffix += 1
        conn.execute("""INSERT INTO agents
            (id, name, name_key, role, instructions, openclaw_id, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (agent_id, name, key, role, instructions, slug, now, now))
        if notebook_id:
            _assign(conn, agent_id, notebook_id, steward)
        return _record(conn, agent_id)


def create_from_prompt(prompt: str, notebook_id: str | None = None) -> dict[str, object]:
    """Parse the documented short creation instruction without an untrusted model call."""
    match = re.fullmatch(r"\s*Make\s+(.+?)\s+my\s+(.+?)(?:\s*[;.].*)?\s*", prompt, re.IGNORECASE | re.DOTALL)
    if not match:
        raise ValueError("Try: Make Mira my project coordinator")
    notebook_match = re.search(r"\bkeep\s+the\s+(.+?)\s+notebook\b", prompt, re.IGNORECASE)
    if notebook_match and not notebook_id:
        requested = notebook_match.group(1).strip().casefold()
        with storage.connect() as conn:
            found = conn.execute("SELECT id FROM notebooks WHERE normalized = ?", (requested,)).fetchall()
        if len(found) != 1:
            raise ValueError("Choose the notebook for this agent")
        notebook_id = str(found[0]["id"])
    return create(match.group(1), match.group(2), prompt.strip(), notebook_id, bool(notebook_id))


def update(agent_id: str, *, name: str | None = None, role: str | None = None,
           instructions: str | None = None) -> dict[str, object]:
    with storage.connect() as conn:
        current = _record(conn, agent_id)
        next_name = _value(name, "Name", 80) if name is not None else str(current["name"])
        next_role = _value(role, "Role", 160) if role is not None else str(current["role"])
        next_instructions = instructions.strip() if instructions is not None else str(current["instructions"])
        if len(next_instructions) > 4000:
            raise ValueError("Instructions must be at most 4000 characters")
        try:
            conn.execute("""UPDATE agents SET name = ?, name_key = ?, role = ?, instructions = ?, updated_at = ?
                WHERE id = ?""", (next_name, next_name.casefold(), next_role, next_instructions, _now(), agent_id))
        except sqlite3.IntegrityError as exc:
            raise ValueError("An agent with this name already exists") from exc
        return _record(conn, agent_id)


def _assign(conn: sqlite3.Connection, agent_id: str, notebook_id: str, steward: bool) -> None:
    if conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone() is None:
        raise LookupError("Notebook not found")
    if steward:
        conn.execute("UPDATE agent_notebooks SET is_steward = 0 WHERE notebook_id = ?", (notebook_id,))
    conn.execute("""INSERT INTO agent_notebooks(agent_id, notebook_id, is_steward) VALUES (?, ?, ?)
        ON CONFLICT(agent_id, notebook_id) DO UPDATE SET is_steward = excluded.is_steward""",
        (agent_id, notebook_id, int(steward)))


def assign(agent_id: str, notebook_id: str, steward: bool = False) -> dict[str, object]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        _assign(conn, agent_id, notebook_id, steward)
        return _record(conn, agent_id)


def unassign(agent_id: str, notebook_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        conn.execute("DELETE FROM agent_notebooks WHERE agent_id = ? AND notebook_id = ?", (agent_id, notebook_id))
        return _record(conn, agent_id)


def resolved_agent(notebook_id: str | None = None, explicit_id: str | None = None) -> dict[str, object]:
    """Return a target only when Stellis has an explicit user or notebook choice."""
    with storage.connect() as conn:
        _default(conn)
        if explicit_id:
            result = _record(conn, explicit_id)
            return {"agent": result, "reason": "explicit"}
        if notebook_id:
            row = conn.execute("""SELECT a.id FROM agents a JOIN agent_notebooks an ON an.agent_id = a.id
                WHERE an.notebook_id = ? AND an.is_steward = 1""", (notebook_id,)).fetchone()
            if row:
                return {"agent": _record(conn, str(row["id"])), "reason": "notebook_steward"}
        return {"agent": None, "reason": "openclaw_default"}


def memories(agent_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        return [dict(row) for row in conn.execute("""SELECT * FROM agent_memories WHERE agent_id = ?
            ORDER BY created_at, id""", (agent_id,))]


def save_memory(agent_id: str, fact: str, kind: str = "general", notebook_id: str | None = None,
                memory_id: str | None = None, source_id: str | None = None) -> dict[str, object]:
    fact = _value(fact, "Memory", 2000)
    if kind not in {"general", "email_convention"}:
        raise ValueError("Unknown memory kind")
    with storage.connect() as conn:
        _record(conn, agent_id)
        if notebook_id and not conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone():
            raise LookupError("Notebook not found")
        if memory_id:
            count = conn.execute("""UPDATE agent_memories SET fact = ?, kind = ?, notebook_id = ?,
                source_id = ?, updated_at = ? WHERE id = ? AND agent_id = ?""",
                (fact, kind, notebook_id, source_id, _now(), memory_id, agent_id)).rowcount
            if not count:
                raise LookupError("Memory not found")
        else:
            memory_id = str(uuid.uuid4())
            now = _now()
            conn.execute("""INSERT INTO agent_memories
                (id, agent_id, notebook_id, kind, fact, source_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (memory_id, agent_id, notebook_id, kind, fact, source_id, now, now))
        return dict(conn.execute("SELECT * FROM agent_memories WHERE id = ?", (memory_id,)).fetchone())


def delete_memory(agent_id: str, memory_id: str) -> None:
    with storage.connect() as conn:
        if not conn.execute("DELETE FROM agent_memories WHERE id = ? AND agent_id = ?", (memory_id, agent_id)).rowcount:
            raise LookupError("Memory not found")


def messages(agent_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        return [dict(row) for row in conn.execute("""SELECT * FROM agent_messages WHERE agent_id = ?
            ORDER BY created_at, id""", (agent_id,))]


def append_message(agent_id: str, role: str, content: str, notebook_id: str | None = None,
                   job_id: str | None = None) -> dict[str, object]:
    if role not in {"user", "agent", "system"}:
        raise ValueError("Unknown message role")
    content = _value(content, "Message", 12000)
    with storage.connect() as conn:
        _record(conn, agent_id)
        if notebook_id and not conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone():
            raise LookupError("Notebook not found")
        message_id = str(uuid.uuid4())
        conn.execute("""INSERT INTO agent_messages(id, agent_id, notebook_id, role, content, job_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""", (message_id, agent_id, notebook_id, role, content, job_id, _now()))
        return dict(conn.execute("SELECT * FROM agent_messages WHERE id = ?", (message_id,)).fetchone())


def delete(agent_id: str) -> None:
    with storage.connect() as conn:
        row = conn.execute("SELECT is_default FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if row is None:
            raise LookupError("Agent not found")
        if row["is_default"]:
            raise ValueError("The general agent cannot be deleted")
        conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
