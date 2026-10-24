"""Isolated browser fixture: seeds a notebook with a course, a planned visit and lab facts.

Run with PYTHONPATH=src:<repo>, a temporary STELLIS_DATA_DIR and STELLIS_BRIEF_FIXTURE
(a JSON path that receives the notebook ID). Never a product entrypoint.
"""
import datetime as dt
import json
import os
import uuid
from pathlib import Path

import pymupdf
from stellis import care_events, documents, health_facts, notebooks, server, storage, trackers

today = dt.date.today()
blood = notebooks.create('Blood Health')['id']
pregnancy = notebooks.create('Pregnancy')['id']


def report(book, title, line):
    with pymupdf.open() as pdf:
        pdf.new_page().insert_text((40, 60), line)
        record, _ = documents.create(title + '.pdf', pdf.tobytes())
    documents.update(record['id'], title=title, notebook_id=book, move=True)
    return record['id']


def fact(document_id, name, value, unit, date, quote):
    with storage.connect() as conn:
        health_facts._create_table(conn)
        conn.execute('''INSERT INTO health_facts (id, document_id, page, kind, name, value, unit, fact_date,
            quote, status, created_at) VALUES (?, ?, 1, 'lab_result', ?, ?, ?, ?, ?, 'accepted', ?)''',
                     (str(uuid.uuid4()), document_id, name, value, unit, date, quote, date))


def day(offset):
    return (today + dt.timedelta(days=offset)).isoformat()


rows = [(blood, 'CBC, ferritin and thyroid results', -1700, '11', 'L'), (blood, 'Iron treatment follow-up', -1580, '34', ''),
        (pregnancy, 'Early pregnancy bloods', -330, '9', 'L'), (pregnancy, 'Second trimester bloods', -300, '22', ''),
        (blood, 'Postpartum iron follow-up', -250, '42', ''), (blood, 'Fatigue laboratory investigation', -67, '13', 'L')]
for book, title, offset, value, flag in rows:
    line = f'Ferritin {value} ug/L 15-150 {flag}'.strip()
    document = report(book, title, line)
    fact(document, 'Ferritin', value, 'ug/L', day(offset), line)
    if title.startswith('Fatigue'):
        fact(document, 'Hemoglobin', '122', 'g/L', day(offset), 'Hemoglobin 122 g/L 120-160')
prescription = report(blood, 'Recurrent iron deficiency treatment', 'Ferrous sulfate 300 mg, 45 tablets, 1 repeat')
start = day(-63)
course = trackers.save('medicine', {'name': 'Ferrous sulfate', 'dose_amount': 300, 'dose_unit': 'mg',
                                    'schedule_type': 'every', 'every_days': 2, 'start': start, 'units_per_fill': 45,
                                    'supply_unit': 'tablets', 'repeats': 1, 'notebook_id': blood,
                                    'source_document_id': prescription, 'source_page': 1})
for offset in range(-63, 0, 2):
    trackers.log(course['id'], day(offset), 'taken')
care_events.add('Repeat CBC and ferritin', f'{day(25)}T09:00:00+00:00', 'planned', blood)
Path(os.environ['STELLIS_BRIEF_FIXTURE']).write_text(json.dumps({'notebook': blood, 'today': today.isoformat()}))
app = server.app
