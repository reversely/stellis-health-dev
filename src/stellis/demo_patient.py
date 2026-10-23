"""Isolated, disposable Maya workspaces and verified yearly synthetic packages."""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import re
from pathlib import Path
import shutil
import threading
import uuid
import zipfile
import weakref
from datetime import date

from stellis import documents, health_catalogue, notebook_sources, notebooks, storage

COOKIE = 'stellis-demo'
MAX_ZIP_BYTES = 10_000_000
_LOCK = threading.RLock()
_REQUEST_LOCKS = weakref.WeakKeyDictionary()
_CLEARING = set()
STATIC = Path(__file__).parent / 'static' / 'maya'


def _control() -> Path:
    return storage.base_dir() / 'maya-demo.json'


def _write(path: Path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    os.replace(temporary, path)


def workspace() -> Path:
    """Resolves a generation whose database and files never share the real account root."""
    with _LOCK:
        path = _control()
        if not path.exists():
            _write(path, {'generation': uuid.uuid4().hex})
        generation = json.loads(path.read_text())['generation']
        if not isinstance(generation, str) or not re.fullmatch('[a-f0-9]{32}', generation):
            raise ValueError('Reset the demo workspace')
        return storage.base_dir() / 'demos' / generation


def clearing():
    return str(storage.base_dir()) in _CLEARING


def begin_clear():
    account = str(storage.base_dir())
    if account in _CLEARING:
        return False
    _CLEARING.add(account)
    return True


def finish_clear():
    _CLEARING.discard(str(storage.base_dir()))


def request_lock():
    """Coordinate demo responses and resets within the account's server loop."""
    locks = _REQUEST_LOCKS.setdefault(asyncio.get_running_loop(), {})
    return locks.setdefault(str(storage.base_dir()), asyncio.Lock())


def existing_workspace():
    """Resolve an existing generation without resurrecting a cleared demo."""
    with _LOCK:
        return workspace() if _control().exists() else None


def _state():
    path = storage.data_dir() / 'demo-history.json'
    return json.loads(path.read_text()) if path.exists() else {'years': {}}


def _save(state):
    _write(storage.data_dir() / 'demo-history.json', state)


def guide():
    return json.loads((STATIC / 'guide.json').read_text())


def status():
    if not _control().exists():
        return {'years': {}, 'documents': 0, 'notebooks': []}
    with storage.demo_workspace(workspace()):
        return {**_state(), 'generation': json.loads(_control().read_text())['generation'], 'documents': len(documents.list_all()), 'notebooks': notebooks.list_notebooks()}


def import_year(content: bytes):
    """Validates every member before writing only the known synthetic PDF bytes."""
    if len(content) > MAX_ZIP_BYTES:
        raise ValueError('Choose a demo ZIP under 10 MB')
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            members = archive.infolist()
            names = [item.filename for item in members]
            if len(names) != len(set(names)) or len(members) > 30 or any(
                    item.file_size > 5_000_000 or item.flag_bits & 1 for item in members
            ) or sum(item.file_size for item in members) > 10_000_000:
                raise ValueError('This demo ZIP has unsupported contents')
            package = json.loads(archive.read('demo-package.json'))
            year = str(package['year'])
            expected = [item for item in guide()['steps'] if item['year'] == year]
            if package.get('format') != 'stellis-maya-year-v1' or year not in {'2022','2023','2024','2025','2026'}:
                raise ValueError('Choose a Maya yearly demo ZIP')
            if not expected or set(names) != {'demo-package.json', *(item['filename'] for item in expected)}:
                raise ValueError('The demo ZIP must contain exactly this year’s records')
            validated = []
            for item in expected:
                data = archive.read(item['filename'])
                if hashlib.sha256(data).hexdigest() != item['sha256']:
                    raise ValueError('A demo PDF does not match the synthetic corpus')
                validated.append((item, data))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError, UnicodeError, RuntimeError) as exc:
        raise ValueError('Choose a valid Maya yearly demo ZIP') from exc
    state = _state()
    if year in state['years']:
        return review(year)
    next_year = next((str(y) for y in range(2022, 2027) if str(y) not in state['years']), None)
    if year != next_year:
        raise ValueError(f'Upload the {next_year} demo ZIP next')
    if any(not value.get('filed') for value in state['years'].values()):
        raise ValueError('Finish reviewing this year before uploading the next year')
    added = []
    for item, data in validated:
        record, _ = documents.create(item['filename'], data)
        added.append({'document_id': item['document_id'], 'id': record['id']})
    state['years'][year] = {'records': added, 'dates_confirmed': False, 'filed': False}
    _save(state)
    return review(year)


def review(year: str):
    state = _state()
    if year not in state['years']:
        raise ValueError('Upload this year’s demo ZIP first')
    known = {item['document_id']: item for item in guide()['steps']}
    records = []
    suggestions = {}
    existing = {item.get('template_id'): item for item in notebooks.list_notebooks()}
    for entry in state['years'][year]['records']:
        item = known[entry['document_id']]
        records.append({**documents.get(entry['id']), 'corpus_id': item['document_id']})
        for book in item['notebooks']:
            suggestion = suggestions.setdefault(book['template_id'], {**book, 'record_count': 0,
                'existing': book['template_id'] in existing})
            suggestion['record_count'] += 1
    return {**state['years'][year], 'year': year, 'documents': records, 'suggestions': list(suggestions.values())}


def confirm_dates(year: str, values: dict):
    data = review(year)
    known = {item['document_id']: item for item in guide()['steps']}
    for record in data['documents']:
        value = values.get(record['id'], '')
        try:
            date.fromisoformat(value)
        except (ValueError, TypeError) as exc:
            raise ValueError('Confirm a visit or test date for every report') from exc
        if value != known[record['corpus_id']]['date']:
            raise ValueError(f"Check the visit or test date in {record['corpus_id']}")
    for record in data['documents']:
        documents.update(record['id'], record_date=values[record['id']])
    state = _state(); state['years'][year]['dates_confirmed'] = True; _save(state)
    return review(year)


def file_records(year: str, selected: list[str]):
    data = review(year)
    allowed = {book['template_id'] for book in data['suggestions']}
    if not data['dates_confirmed']:
        raise ValueError('Confirm report dates before filing records')
    if not selected or not set(selected) <= allowed:
        raise ValueError('Choose suggested notebooks for this year')
    health_catalogue.activate([{'template_id': identifier} for identifier in dict.fromkeys(selected)])
    books = {book.get('template_id'): book for book in notebooks.list_notebooks()}
    known = {item['document_id']: item for item in guide()['steps']}
    for record in data['documents']:
        targets = [books[book['template_id']] for book in known[record['corpus_id']]['notebooks'] if book['template_id'] in selected]
        if not targets:
            continue
        documents.update(record['id'], notebook_id=targets[0]['id'], move=True)
        for book in targets[1:]:
            notebook_sources.link(book['id'], 'document:' + record['id'])
    state = _state(); state['years'][year]['filed'] = True; _save(state)
    return review(year)


def clear():
    """Removes only the active demo generation, including its derived records and chats."""
    with _LOCK:
        if not _control().exists():
            return
        path = workspace()
        _control().unlink()
        shutil.rmtree(path, ignore_errors=True)
