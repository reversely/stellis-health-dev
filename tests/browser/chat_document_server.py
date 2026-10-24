"""Isolated browser fixture: an agent thread with a saved attached report, a cited reply and facts to check.

Run with PYTHONPATH=src:<repo>, a temporary STELLIS_DATA_DIR and STELLIS_CHAT_FIXTURE (a JSON
path that receives the IDs). Never a product entrypoint; the reply is seeded, not generated.
"""
import datetime as dt
import json
import os
import uuid
from pathlib import Path

import pymupdf
from stellis import agents, chat_attachments, documents, health_facts, notebooks, server, storage

LINES = ['Specimen collected: 2026-06-15', 'Test     Result     Units     Reference interval',
         'Hemoglobin 122 g/L 120-160', 'MCV 85 fL 80-100', 'Ferritin 13 ug/L 15-150 L', 'TSH 1.64 mIU/L 0.4-4']


def pdf(lines):
    with pymupdf.open() as doc:
        page = doc.new_page(width=420, height=500)
        for index, line in enumerate(lines):
            page.insert_text((35, 45 + index * 30), line)
        return doc.tobytes()


book = notebooks.create('Blood Health', '#D94F70')['id']
agent = agents.list_agents()[0]
attachment = chat_attachments.add('agent', agent['id'], 'D065_fatigue-laboratory-investigation.pdf', pdf(LINES))
document = attachment['document_id']
documents.update(document, title='Fatigue laboratory investigation', record_date='2026-06-15')
chat_attachments.save('agent', agent['id'], attachment['id'], book)
prior, _ = documents.create('postpartum.pdf', pdf(['Collected: 2025-10-10', 'Ferritin 42 ug/L 15-150']))
documents.update(prior['id'], title='Postpartum iron follow-up', notebook_id=book, move=True)
question = agents.append_message(agent['id'], 'user', 'These are my June 15 results. What changed since my last iron test?', book)
chat_attachments.bind('agent', agent['id'], [attachment['id']], question['id'])
agents.append_message(agent['id'], 'agent', (
    f'Your June 15 report shows ferritin at 13 ug/L, marked L against the range of 15 to 150 '
    f'[Fatigue laboratory investigation](/document/{document}?page=1). Your last ferritin was 42 ug/L on October 10, 2025 '
    f'[Postpartum iron follow-up](/document/{prior["id"]}?page=1). Hemoglobin is 122 g/L, within its range '
    f'[Fatigue laboratory investigation](/document/{document}?page=1).'), book)
with storage.connect() as conn:
    health_facts._create_table(conn)
    for name, value, unit, quote in [('Hemoglobin', '122', 'g/L', 'Hemoglobin 122 g/L 120-160'), ('MCV', '85', 'fL', 'MCV 85 fL 80-100'),
                                     ('Ferritin', '13', 'ug/L', 'Ferritin 13 ug/L 15-150 L'), ('TSH', '1.64', 'mIU/L', 'TSH 1.64 mIU/L 0.4-4')]:
        conn.execute('''INSERT INTO health_facts (id, document_id, page, kind, name, value, unit, fact_date, quote, status,
            created_at) VALUES (?, ?, 1, 'lab_result', ?, ?, ?, '2026-06-15', ?, 'suggested', ?)''',
                     (str(uuid.uuid4()), document, name, value, unit, quote, dt.datetime.now(dt.timezone.utc).isoformat()))
Path(os.environ['STELLIS_CHAT_FIXTURE']).write_text(json.dumps({'agent': agent['id'], 'document': document}))
app = server.app
