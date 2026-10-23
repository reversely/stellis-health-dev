"""Account-local scheduled and planned health events entered by the person."""
from __future__ import annotations

from datetime import datetime, timezone
import uuid

from stellis import storage


def _table(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS care_events (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, starts_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('scheduled','planned')),
        notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
        note TEXT NOT NULL, created_at TEXT NOT NULL)''')


def _event(row) -> dict:
    return {**dict(row), 'target': '/?event=' + row['id']}


def list_all(notebook_id: str | None = None) -> list[dict]:
    """Returns dated events with links to their detail dialog."""
    with storage.connect() as conn:
        _table(conn)
        query = 'SELECT * FROM care_events'
        values = ()
        if notebook_id is not None:
            query += ' WHERE notebook_id = ?'
            values = (notebook_id,)
        return [_event(row) for row in conn.execute(query + ' ORDER BY starts_at', values)]


def add(title: str, starts_at: str, status: str,
        notebook_id: str | None = None, note: str = '') -> dict:
    """Saves the confirmed event with a timezone-aware start and optional notebook."""
    notebook_id = notebook_id or None
    title = title.strip()
    if not title or len(title) > 180 or len(note) > 1000:
        raise ValueError('Enter an event title and a short note')
    if status not in {'scheduled', 'planned'}:
        raise ValueError('Choose scheduled or planned')
    try:
        moment = datetime.fromisoformat(starts_at)
    except ValueError as exc:
        raise ValueError('Choose an event date and time') from exc
    if moment.tzinfo is None:
        raise ValueError('The event time needs a time zone')
    identifier = str(uuid.uuid4())
    with storage.connect() as conn:
        _table(conn)
        if notebook_id and not conn.execute(
                'SELECT id FROM notebooks WHERE id = ? AND archived_at IS NULL',
                (notebook_id,)).fetchone():
            raise ValueError('Choose an available notebook')
        conn.execute('INSERT INTO care_events VALUES (?,?,?,?,?,?,?)',
                     (identifier, title, moment.astimezone(timezone.utc).isoformat(),
                      status, notebook_id, note.strip(), datetime.now(timezone.utc).isoformat()))
        return _event(conn.execute('SELECT * FROM care_events WHERE id = ?',
                                   (identifier,)).fetchone())


def delete(identifier: str) -> None:
    """Removes one user-entered event without changing its source notebook."""
    with storage.connect() as conn:
        _table(conn)
        if not conn.execute('DELETE FROM care_events WHERE id = ?', (identifier,)).rowcount:
            raise LookupError('Event not found')
