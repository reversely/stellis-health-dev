"""One synthetic patient's records, filed into a notebook on request.

The files come from ``scripts/make_sample_records.py`` and follow one Synthea
patient from 1997 to 2026. Nothing loads them automatically; an operator runs
``python -m stellis.sample_records --data-dir DIR`` for one account.
"""

from __future__ import annotations

import json
import pathlib

from stellis import documents
from stellis import notebooks
from stellis import storage

FOLDER = pathlib.Path(__file__).parent
NOTEBOOK = "Sample records"


def manifest() -> dict[str, object]:
    """Returns the manifest: the patient, the source note and each record."""
    return json.loads((FOLDER / "manifest.json").read_text())


def _notebook_id(name: str) -> str:
    with storage.connect() as conn:
        row = conn.execute("SELECT id FROM notebooks WHERE normalized = ?",
                           (name.casefold(),)).fetchone()
    return str(row["id"]) if row else str(notebooks.create(name)["id"])


def load(notebook_name: str = NOTEBOOK) -> dict[str, object]:
    """Files every sample record into a notebook.

    Args:
        notebook_name: The notebook to use, created when missing.

    Returns:
        ``notebook_id``, the number of records ``added`` and the ``total``.
        Records the account already has are skipped, so a second run adds
        nothing.
    """
    notebook_id = _notebook_id(notebook_name)
    records = manifest()["records"]
    added = 0
    for record in records:
        content = (FOLDER / record["file"]).read_bytes()
        document, duplicate = documents.create(record["file"], content,
                                               notebook_id,
                                               record["record_date"])
        if not duplicate:
            documents.update(str(document["id"]), title=record["title"])
            added += 1
    return {"notebook_id": notebook_id, "added": added, "total": len(records)}
