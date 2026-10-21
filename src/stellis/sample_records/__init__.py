"""Sample pathology records from TCGA-Reports, filed into one notebook on request.

The files come from scripts/make_sample_records.py. Nothing loads them automatically;
an operator runs ``python -m stellis.sample_records --data-dir DIR`` for one account.
"""
from __future__ import annotations

import json
from pathlib import Path

from stellis import documents, notebooks, storage

FOLDER = Path(__file__).parent
NOTEBOOK = "Sample records"


def load(notebook_name: str = NOTEBOOK) -> dict[str, object]:
    """Upload every sample file into the named notebook, creating it when needed; repeats add nothing."""
    with storage.connect() as conn:
        row = conn.execute("SELECT id FROM notebooks WHERE normalized = ?", (notebook_name.casefold(),)).fetchone()
    notebook_id = str(row["id"]) if row else str(notebooks.create(notebook_name)["id"])
    manifest = json.loads((FOLDER / "manifest.json").read_text())
    added = 0
    for record in manifest["records"]:
        document, duplicate = documents.create(record["file"], (FOLDER / record["file"]).read_bytes(), notebook_id)
        if not duplicate:
            documents.update(str(document["id"]), title=record["title"])
            added += 1
    return {"notebook_id": notebook_id, "added": added, "total": len(manifest["records"])}
