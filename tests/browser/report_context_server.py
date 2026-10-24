"""Isolated browser fixture: real documents/DB/geometry, deterministic model only.

Run with PYTHONPATH=src:<repo> and a temporary STELLIS_DATA_DIR. Never a product entrypoint.
"""
import json
from pathlib import Path
import os

import pymupdf
from stellis import ai, agent_gateway, documents, server


def pdf(value, date):
    with pymupdf.open() as doc:
        page = doc.new_page(width=420, height=500)
        page.insert_text((35, 45), f'Specimen collected: {date}')
        page.insert_text((35, 80), 'Test          Result          Unit          Reference interval')
        page.insert_text((35, 115), f'Potassium     {value}          mmol/L        3.5 - 5.1')
        return doc.tobytes()


record, _ = documents.create('current-lab.pdf', pdf('5.4', '2026-04-02'))
prior, _ = documents.create('earlier-lab.pdf', pdf('4.8', '2025-10-02'))
Path(os.environ['STELLIS_REPORT_FIXTURE']).write_text(json.dumps({'record': record, 'prior': prior}))
ai.capabilities = lambda: {'configured': True}


async def turn(prompt, session):
    import asyncio
    await asyncio.sleep(.1)
    if 'How has this changed?' in prompt:
        return 'The selected report shows potassium 5.4 mmol/L. [[source:1]] The earlier report lists 4.8 mmol/L. [[source:2]]', session
    return 'This row reports potassium 5.4 mmol/L, with a reference interval of 3.5–5.1. [[source:1]]', session


agent_gateway.turn = turn
app = server.app
