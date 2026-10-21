"""Local agent identities, notebook assignments, memory, and Chat history."""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timezone

from stellis import agent_templates, storage


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
        (id, name, name_key, role, instructions, slug, is_default, created_at, updated_at)
        VALUES (?, 'General', 'general', 'General assistant', '', 'general', 1, ?, ?)""",
        (str(uuid.uuid4()), now, now))


def _record(conn: sqlite3.Connection, agent_id: str) -> dict[str, object]:
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if row is None:
        raise LookupError("Agent not found")
    assignments = [dict(item) for item in conn.execute("""SELECT an.notebook_id, n.name AS notebook_name,
        an.is_steward, an.enabled FROM agent_notebooks an JOIN notebooks n ON n.id = an.notebook_id
        WHERE an.agent_id = ? ORDER BY n.name COLLATE NOCASE""", (agent_id,))]
    record = {**dict(row), "is_default": bool(row["is_default"]), "enabled": bool(row["enabled"]),
              "notebooks": [{**item, "is_steward": bool(item["is_steward"]), "enabled": bool(item["enabled"])} for item in assignments]}
    return {**record, "behavior": agent_templates.behavior(record)}


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
           steward: bool = False, template_id: str | None = None) -> dict[str, object]:
    if template_id:
        agent_templates.get(template_id)
    name = _value(name, "Name", 80)
    role = _value(role, "Role", 160)
    instructions = instructions.strip()
    if len(instructions) > 4000:
        raise ValueError("Instructions must be at most 4000 characters")
    key = name.casefold()
    slug = re.sub(r"[^a-z0-9]+", "-", key).strip("-")[:24] or "agent"
    agent_id = str(uuid.uuid4())
    now = _now()
    with storage.connect() as conn:
        _default(conn)
        if conn.execute("SELECT 1 FROM agents WHERE name_key = ?", (key,)).fetchone():
            raise ValueError("An agent with this name already exists")
        base = slug
        suffix = 2
        while conn.execute("SELECT 1 FROM agents WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base[:21]}-{suffix}"
            suffix += 1
        conn.execute("""INSERT INTO agents
            (id, name, name_key, role, instructions, slug, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (agent_id, name, key, role, instructions, slug, now, now))
        conn.execute("UPDATE agents SET template_id = ? WHERE id = ?", (template_id, agent_id))
        if notebook_id:
            _assign(conn, agent_id, notebook_id, steward)
        return _record(conn, agent_id)


def create_from_prompt(prompt: str, notebook_id: str | None = None) -> dict[str, object]:
    """Parse the documented short creation instruction without an untrusted model call."""
    match = re.fullmatch(r"\s*Make\s+(.+?)\s+my\s+(.+?)(?:\s*[;.].*)?\s*", prompt, re.IGNORECASE | re.DOTALL)
    if not match:
        raise ValueError("Try: Make Writing my project writing agent")
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
           instructions: str | None = None, enabled: bool | None = None) -> dict[str, object]:
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
        if enabled is not None:
            if current["is_default"] and not enabled:
                raise ValueError("The default agent must remain on")
            conn.execute("UPDATE agents SET enabled = ? WHERE id = ?", (int(enabled), agent_id))
        return _record(conn, agent_id)


def require_enabled(agent_id: str, notebook_id: str | None = None) -> dict[str, object]:
    agent = get(agent_id)
    if not agent["enabled"]:
        raise ValueError("This agent is off. Turn it on in Agent settings.")
    if notebook_id:
        assignment = next((item for item in agent["notebooks"] if item["notebook_id"] == notebook_id), None)
        if assignment and not assignment["enabled"]:
            raise ValueError("This agent is off in this notebook. Turn it on in Agent settings.")
    return agent


def set_notebook_enabled(agent_id: str, notebook_id: str, enabled: bool) -> dict:
    with storage.connect() as conn:
        _record(conn, agent_id)
        if not conn.execute("UPDATE agent_notebooks SET enabled = ? WHERE agent_id = ? AND notebook_id = ?",
                            (int(enabled), agent_id, notebook_id)).rowcount:
            raise LookupError("Notebook assignment not found")
        return _record(conn, agent_id)


def _assign(conn: sqlite3.Connection, agent_id: str, notebook_id: str, steward: bool) -> None:
    if conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone() is None:
        raise LookupError("Notebook not found")
    agent = _record(conn, agent_id)
    if steward and agent.get("template_id") not in (None, "steward"):
        raise ValueError("Add a Steward template to coordinate this notebook")
    if agent.get("template_id") == "steward":
        if any(item["notebook_id"] != notebook_id for item in agent["notebooks"]):
            raise ValueError("A Steward serves one notebook. Add a Steward to the other notebook instead.")
        steward = True
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
    """Select the visible agent from the Chat thread, notebook steward, or General."""
    with storage.connect() as conn:
        _default(conn)
        if explicit_id:
            result = _record(conn, explicit_id)
            if not result["enabled"]:
                raise ValueError("This agent is off. Turn it on in Agent settings.")
            if notebook_id and any(item["notebook_id"] == notebook_id and not item["enabled"] for item in result["notebooks"]):
                raise ValueError("This agent is off in this notebook")
            return {"agent": result, "reason": "explicit"}
        if notebook_id:
            row = conn.execute("""SELECT a.id FROM agents a JOIN agent_notebooks an ON an.agent_id = a.id
                WHERE an.notebook_id = ? AND an.is_steward = 1 AND a.enabled = 1 AND an.enabled = 1""", (notebook_id,)).fetchone()
            if row:
                return {"agent": _record(conn, str(row["id"])), "reason": "notebook_steward"}
        row = conn.execute("SELECT id FROM agents WHERE is_default = 1").fetchone()
        return {"agent": _record(conn, str(row["id"])), "reason": "general_default"}


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


def remember_email_convention(agent_id: str, notebook_id: str, message: dict) -> dict[str, object] | None:
    """Save a project's first observed mail pattern without overwriting user edits."""
    subject = str(message.get("subject") or "").strip()
    if not subject:
        return None
    subject = re.sub(r"^(?:(?:re|fw|fwd):\s*)+", "", subject, flags=re.IGNORECASE)
    match = re.match(r"(.+?\b(?:RFI|RFQ|PO|CO))\s+\d+\b", subject, re.IGNORECASE)
    subject_pattern = match.group(1) if match else " ".join(subject.split()[:3])
    labels = [str(label) for label in message.get("labelIds", [])
              if str(label).startswith("Label_")]
    fields = [message.get("sender", ""), *(message.get("toRecipients") or []),
              *(message.get("ccRecipients") or [])]
    addresses = list(dict.fromkeys(address.casefold() for field in fields
                                   for address in re.findall(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", str(field))))
    domains = list(dict.fromkeys(address.rsplit("@", 1)[1] for address in addresses))
    parts = [f"Project email subjects begin {subject_pattern}"]
    if labels:
        parts.append("labels: " + ", ".join(labels[:4]))
    if domains:
        parts.append("counterpart domains: " + ", ".join(domains[:6]))
    if addresses:
        parts.append("participants: " + ", ".join(addresses[:8]))
    fact = "; ".join(parts) + "."
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        _record(conn, agent_id)
        if not conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone():
            raise LookupError("Notebook not found")
        if not conn.execute("SELECT 1 FROM agent_notebooks WHERE agent_id = ? AND notebook_id = ?",
                            (agent_id, notebook_id)).fetchone():
            raise ValueError("Assign this notebook to the agent first")
        prior = conn.execute("""SELECT * FROM agent_memories WHERE agent_id = ? AND notebook_id = ?
            AND kind = 'email_convention' ORDER BY created_at LIMIT 1""", (agent_id, notebook_id)).fetchone()
        if prior:
            return dict(prior)
        memory_id = str(uuid.uuid4())
        now = _now()
        conn.execute("""INSERT INTO agent_memories
            (id, agent_id, notebook_id, kind, fact, source_id, created_at, updated_at)
            VALUES (?, ?, ?, 'email_convention', ?, ?, ?, ?)""",
            (memory_id, agent_id, notebook_id, _value(fact, "Memory", 2000),
             f"mail:{message['id']}" if message.get("id") else None, now, now))
        return dict(conn.execute("SELECT * FROM agent_memories WHERE id = ?", (memory_id,)).fetchone())


def delete_memory(agent_id: str, memory_id: str) -> None:
    with storage.connect() as conn:
        if not conn.execute("DELETE FROM agent_memories WHERE id = ? AND agent_id = ?", (memory_id, agent_id)).rowcount:
            raise LookupError("Memory not found")


def messages(agent_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        rows = [dict(row) for row in conn.execute("""SELECT m.*,h.target_id AS addressed_agent_id,
            h.target_name AS addressed_agent_name,h.reply_id,h.target_message_id
            FROM agent_messages m LEFT JOIN agent_handoffs h ON h.id=m.job_id
            WHERE m.agent_id=? ORDER BY m.created_at,m.id""", (agent_id,))]
        from stellis import agent_artifacts
        for row in rows:
            if row['id'] == row.get('reply_id') and row.get('target_message_id'):
                artifact = conn.execute('SELECT * FROM agent_artifacts WHERE message_id=?', (row['target_message_id'],)).fetchone()
                if artifact:row['routed_artifact'] = agent_artifacts._record(artifact, conn)
        return rows



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


def start_job(agent_id: str, notebook_id: str | None = None) -> str:
    """Record a reply before calling the sandbox so failed attempts stay visible."""
    job_id = str(uuid.uuid4())
    with storage.connect() as conn:
        _record(conn, agent_id)
        conn.execute("""INSERT INTO agent_jobs(id, agent_id, notebook_id, state, created_at)
            VALUES (?, ?, ?, 'running', ?)""", (job_id, agent_id, notebook_id, _now()))
    return job_id


def finish_job(job_id: str, state: str, error: str | None = None) -> None:
    if state not in {"succeeded", "failed", "interrupted"}:
        raise ValueError("Unknown job state")
    with storage.connect() as conn:
        conn.execute("""UPDATE agent_jobs SET state = ?, error = ?, finished_at = ? WHERE id = ?""",
                     (state, error, _now(), job_id))
        if state == 'succeeded':
            from stellis import agent_followups
            agent_followups.publish(conn, job_id)


def jobs(agent_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        _record(conn, agent_id)
        rows = [dict(row) for row in conn.execute("""SELECT j.* FROM agent_jobs j LEFT JOIN agent_handoffs h ON h.id=j.id WHERE j.agent_id = ? OR h.target_id = ?
            ORDER BY j.created_at,j.id""", (agent_id,agent_id))]
    from stellis import agent_coordination
    for row in rows:
        row['steps'] = agent_coordination.steps(row['id'])
    return rows


def interrupt_running_jobs() -> None:
    """Mark replies lost when the web process stopped during a sandbox call."""
    with storage.connect() as conn:
        conn.execute("""UPDATE agent_jobs SET state = 'interrupted', error = 'Reply interrupted. Send again.',
            finished_at = ? WHERE state = 'running'""", (_now(),))
        conn.execute("UPDATE agent_work_steps SET state='interrupted', error='Work interrupted. Send again.' WHERE state='running'")
        conn.execute("UPDATE agent_work_steps SET state='skipped' WHERE state='queued'")


def delete(agent_id: str) -> None:
    with storage.connect() as conn:
        row = conn.execute("SELECT is_default FROM agents WHERE id = ?", (agent_id,)).fetchone()
        if row is None:
            raise LookupError("Agent not found")
        if row["is_default"]:
            raise ValueError("The general agent cannot be deleted")
        if conn.execute("SELECT 1 FROM agent_jobs WHERE agent_id = ? AND state = 'running'", (agent_id,)).fetchone():
            raise ValueError("Stop this agent's active request before deleting it")
        if conn.execute("SELECT 1 FROM inference_traces WHERE agent_id = ? AND state = 'running'", (agent_id,)).fetchone():
            raise ValueError("Stop this agent's active request before deleting it")
        if conn.execute("SELECT 1 FROM agent_delegations WHERE (steward_id = ? OR specialist_id = ?) AND state IN ('queued', 'running')", (agent_id, agent_id)).fetchone():
            raise ValueError("Stop this agent's delegated job before deleting it")
        conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))


def deploy(template_id: str, notebook_id: str | None = None, name: str | None = None,
           instructions: str = "") -> dict[str, object]:
    """Reuse a template deployment; a supplied name creates an independent identity."""
    template = agent_templates.get(template_id)
    if template_id == "steward" and not notebook_id:
        raise ValueError("Choose a notebook for its Steward")
    with storage.connect() as conn:
        notebook = conn.execute("SELECT name FROM notebooks WHERE id = ?", (notebook_id,)).fetchone() if notebook_id else None
        if notebook_id and not notebook:
            raise LookupError("Notebook not found")
        if not name:
            if template_id == "steward":
                row = conn.execute("SELECT agent_id FROM agent_notebooks WHERE notebook_id = ? AND is_steward = 1", (notebook_id,)).fetchone()
                if row is None:
                    row = conn.execute("""SELECT a.id AS agent_id FROM agents a WHERE a.template_id = 'steward'
                        AND a.name_key = ? AND NOT EXISTS (SELECT 1 FROM agent_notebooks n WHERE n.agent_id = a.id)""",
                        ((f"{notebook['name'][:65]} Steward").casefold(),)).fetchone()
            else:
                row = conn.execute("SELECT id FROM agents WHERE template_id = ? AND name_key = ?", (template_id, template["name"].casefold())).fetchone()
            if row:
                existing_id = str(row[0])
            else:
                existing_id = None
        else:
            existing_id = None
    if existing_id:
        return assign(existing_id, notebook_id, template_id == "steward") if notebook_id else get(existing_id)
    deployment_name = name or (f"{notebook['name'][:65]} Steward" if template_id == "steward" else template["name"])
    return create(deployment_name, template["does"], instructions, notebook_id,
                  template_id == "steward", template_id)
