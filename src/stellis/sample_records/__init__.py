"""Denver Lang's records: one synthetic patient's files, loaded on request.

The folder holds his clinical records, built from his Synthea bundle by
``scripts/make_sample_records.py``, and his records from outside the hospital
(dietitian, physiotherapy, trainer, devices and his own notes), built by
``scripts/make_narrative_records.py``. Each builder writes its own
``manifest-*.json``. Nothing loads the records automatically; an operator runs
``python -m stellis.sample_records --data-dir DIR`` for one account.
"""

from __future__ import annotations

import json
import pathlib

from stellis import documents
from stellis import notebooks
from stellis import storage

FOLDER = pathlib.Path(__file__).parent


def manifest() -> list[dict[str, str]]:
    """Returns every record from every manifest, oldest record date first."""
    records = []
    for path in sorted(FOLDER.glob("manifest-*.json")):
        records += json.loads(path.read_text())["records"]
    return sorted(records, key=lambda record: record["record_date"])


def _notebook_id(name: str) -> str:
    with storage.connect() as conn:
        row = conn.execute("SELECT id FROM notebooks WHERE normalized = ?",
                           (name.casefold(),)).fetchone()
    return str(row["id"]) if row else str(notebooks.create(name)["id"])


def load(notebook_name: str | None = None) -> dict[str, object]:
    """Uploads every sample record, as a person dumping all their files.

    Args:
        notebook_name: A notebook to file the records in, created when
            missing. None leaves them in no notebook, ready to sort.

    Returns:
        ``notebook_id`` (or None), the number of records ``added`` and the
        ``total``. Records the account already has are skipped, so a second
        run adds nothing.
    """
    notebook_id = _notebook_id(notebook_name) if notebook_name else None
    records = manifest()
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
