"""Account-workspace cycle and contraception records."""

import datetime as dt
import json
import uuid

from stellis import storage

KINDS = {'period', 'pill', 'larc'}


def _table(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS reproductive_records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS pill_doses (
        pill_id TEXT NOT NULL, day TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'taken',
        PRIMARY KEY (pill_id, day))''')
    if 'status' not in {row['name'] for row in conn.execute('PRAGMA table_info(pill_doses)')}:
        conn.execute("ALTER TABLE pill_doses ADD COLUMN status TEXT NOT NULL DEFAULT 'taken'")


def date(value):
    """Read a calendar date without applying a timezone conversion."""
    return dt.date.fromisoformat(value)


def save(kind, data, record_id=None):
    """Validate and store a tracker entry."""
    if kind not in KINDS:
        raise ValueError('Choose a listed tracker')
    start = date(data['start'])
    if kind in {'period', 'larc'} and start > dt.date.today():
        raise ValueError('Start date cannot be in the future')
    if kind == 'period':
        end = date(data['end']) if data.get('end') else None
        if end and (end < start or end > dt.date.today()):
            raise ValueError('End date must be between start date and today')
        if data.get('flow') not in {'Spotting', 'Light', 'Moderate', 'Heavy'}:
            raise ValueError('Choose a flow')
    if kind == 'pill':
        if not 1 <= data['active'] <= 365 or not 0 <= data['break_days'] <= 365:
            raise ValueError('Enter a valid pack length')
        dt.time.fromisoformat(data['time'])
    if kind == 'larc':
        if data['type'] not in {'Hormonal IUD', 'Copper IUD', 'Implant'}:
            raise ValueError('Choose a device type')
        if date(data['renewal']) <= start:
            raise ValueError('Renewal date must follow insertion date')
        if data.get('end') and not start <= date(data['end']) <= dt.date.today():
            raise ValueError('Removal date must be between insertion date and today')
        if not 0 <= data['notice'] <= 365:
            raise ValueError('Enter a notice between 0 and 365 days')
    if kind != 'period' and not data.get('name', '').strip():
        raise ValueError('Enter a name')
    record_id = record_id or str(uuid.uuid4())
    with storage.connect() as conn:
        _table(conn)
        if kind == 'period':
            for row in conn.execute("SELECT id, data FROM reproductive_records WHERE kind = 'period'"):
                other = json.loads(row['data'])
                if row['id'] != record_id and start <= date(other.get('end') or dt.date.today().isoformat()) and date(other['start']) <= (end or dt.date.today()):
                    raise ValueError('Period dates overlap an existing entry')
        if conn.execute('SELECT 1 FROM reproductive_records WHERE id = ? AND kind != ?', (record_id, kind)).fetchone():
            raise ValueError('Tracker type cannot change')
        conn.execute('INSERT INTO reproductive_records VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (record_id, kind, json.dumps(data)))
    return {'id': record_id, 'kind': kind, **data}


def list_records():
    """Return saved entries and dose dates from the current workspace."""
    with storage.connect() as conn:
        _table(conn)
        doses, skipped = {}, {}
        for row in conn.execute('SELECT pill_id, day, status FROM pill_doses ORDER BY day'):
            target = skipped if row['status'] == 'skipped' else doses
            target.setdefault(row['pill_id'], []).append(row['day'])
        return {'records': [{'id': r['id'], 'kind': r['kind'], **json.loads(r['data']),
                             'doses': doses.get(r['id'], []),
                             'skipped': skipped.get(r['id'], [])}
                            for r in conn.execute('SELECT * FROM reproductive_records ORDER BY id')]}


def delete(record_id):
    with storage.connect() as conn:
        _table(conn)
        conn.execute('DELETE FROM pill_doses WHERE pill_id = ?', (record_id,))
        conn.execute('DELETE FROM reproductive_records WHERE id = ?', (record_id,))
    return {'deleted': True}


def dose(record_id, day, taken, status=None):
    if status not in {None, 'taken', 'skipped'}:
        raise ValueError('Choose a listed dose status')
    selected = date(day)
    if selected > dt.date.today():
        raise ValueError('Dose date cannot be in the future')
    with storage.connect() as conn:
        _table(conn)
        row = conn.execute("SELECT data FROM reproductive_records WHERE id = ? AND kind = 'pill'", (record_id,)).fetchone()
        if not row:
            raise ValueError('Pill pack was not found')
        pack = json.loads(row['data'])
        offset = (selected - date(pack['start'])).days
        if offset < 0 or offset % (pack['active'] + pack['break_days']) >= pack['active']:
            raise ValueError('Choose an active pill day')
        if taken or status:
            conn.execute('''INSERT INTO pill_doses (pill_id, day, status) VALUES (?, ?, ?)
                ON CONFLICT(pill_id, day) DO UPDATE SET status=excluded.status''',
                         (record_id, day, status or 'taken'))
        else:
            conn.execute('DELETE FROM pill_doses WHERE pill_id = ? AND day = ?', (record_id, day))
    return {'saved': True}
