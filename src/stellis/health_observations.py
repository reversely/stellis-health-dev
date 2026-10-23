"""Daily health observations, independent of interval-based history."""
from datetime import date
from stellis import storage


def _table(connection):
    connection.execute('''CREATE TABLE IF NOT EXISTS health_observations (
        day TEXT NOT NULL, track_id TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY(day, track_id))''')


def entries():
    with storage.connect() as connection:
        _table(connection)
        return [dict(row) for row in connection.execute('SELECT * FROM health_observations ORDER BY day')]


def save(day, track_id, value):
    if date.fromisoformat(day) > date.today():
        raise ValueError('Choose today or an earlier day')
    if track_id != 'periods' or value not in {None, 'Had flow', 'No bleeding', 'Spotting', 'Light', 'Moderate', 'Heavy'}:
        raise ValueError('Choose a listed flow status')
    with storage.connect() as connection:
        _table(connection)
        if value is None:
            connection.execute('DELETE FROM health_observations WHERE day=? AND track_id=?', (day, track_id))
        else:
            connection.execute('''INSERT INTO health_observations VALUES (?, ?, ?)
                ON CONFLICT(day, track_id) DO UPDATE SET value=excluded.value''', (day, track_id, value))
    return {'saved': True}
