"""Uploaded documents: PDFs and images filed into a notebook, with text per page.

A digital PDF's text is read when it is uploaded. Pages without a text layer, such as
scans, and every image keep the status ``needs_text`` until text recognition exists.
The original file stays in the account's data directory and is served back unchanged.
"""
from __future__ import annotations

import hashlib
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from stellis import storage

MAX_BYTES = 20_000_000
MAX_LABEL = "20 MB"
MAX_PAGES = 300
MEDIA_TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
_SIGNATURES = {"application/pdf": (b"%PDF-",), "image/png": (b"\x89PNG\r\n\x1a\n",), "image/jpeg": (b"\xff\xd8\xff",)}


class DocumentError(ValueError):
    """The upload cannot become a document; the message is safe to show."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _table(conn) -> None:
    conn.execute("""CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL,
        sha256 TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, page_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'needs_text')),
        notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS document_pages (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        page_number INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (document_id, page_number))""")


def _directory() -> Path:
    path = storage.data_dir() / "documents"
    path.mkdir(exist_ok=True, mode=0o700)
    return path


def _title(filename: str) -> str:
    stem = " ".join(re.sub(r"[_]+", " ", Path(filename).stem).split())
    return (stem or "Document")[:180]


def _clean(text: str) -> str:
    """Rejoin lines the PDF wrapped; a line well short of the page's longest one ends a paragraph."""
    lines = [line for line in (" ".join(raw.split()) for raw in text.splitlines()) if line]
    if not lines:
        return ""
    full = max(len(line) for line in lines)
    joined = lines[0]
    for previous, line in zip(lines, lines[1:]):
        joined += ("\n" if len(previous) < 0.7 * full else " ") + line
    return joined


def _pdf_pages(content: bytes) -> list[str]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError
    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise DocumentError("Remove the PDF password and upload it again")
        if len(reader.pages) > MAX_PAGES:
            raise DocumentError(f"Upload a PDF of at most {MAX_PAGES} pages")
        return [_clean(page.extract_text() or "") for page in reader.pages]
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        if isinstance(exc, DocumentError):
            raise
        raise DocumentError("This PDF could not be read") from exc


def _check_image(content: bytes) -> None:
    from PIL import Image, UnidentifiedImageError
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise DocumentError("This image could not be read") from exc


def _public(row, conn) -> dict[str, object]:
    record = {key: row[key] for key in ("id", "title", "filename", "media_type", "size", "page_count", "status",
                                        "notebook_id", "created_at")}
    record["pages"] = [{"number": page["page_number"], "text": page["text"]} for page in conn.execute(
        "SELECT page_number, text FROM document_pages WHERE document_id = ? ORDER BY page_number", (row["id"],))]
    return record


def create(filename: str, content: bytes, notebook_id: str | None = None) -> tuple[dict[str, object], bool]:
    """Store an uploaded PDF or image and its page text; return (document, already_uploaded)."""
    suffix = Path(filename or "").suffix.lower()
    media_type = MEDIA_TYPES.get(suffix)
    if media_type is None:
        raise DocumentError("Choose a PDF, PNG or JPEG file")
    if not content:
        raise DocumentError("The file is empty")
    if len(content) > MAX_BYTES:
        raise DocumentError(f"Upload a document of at most {MAX_LABEL}")
    if not content.startswith(_SIGNATURES[media_type]):
        raise DocumentError(f"This file is not a {suffix[1:].upper()} file")
    digest = hashlib.sha256(content).hexdigest()
    with storage.connect() as conn:
        _table(conn)
        existing = conn.execute("SELECT * FROM documents WHERE sha256 = ?", (digest,)).fetchone()
        if existing:
            return _public(existing, conn), True
        if notebook_id is not None and not conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone():
            raise LookupError("Notebook not found")
    if media_type == "application/pdf":
        pages = _pdf_pages(content)
    else:
        _check_image(content)
        pages = [""]
    identifier = str(uuid.uuid4())
    path = _directory() / f"{identifier}{suffix}"
    path.write_bytes(content)
    path.chmod(0o600)
    status = "ready" if any(pages) else "needs_text"
    with storage.connect() as conn:
        _table(conn)
        conn.execute("""INSERT INTO documents (id, title, filename, media_type, sha256, size, page_count, status,
            notebook_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                     (identifier, _title(filename), Path(filename).name[:255], media_type, digest, len(content),
                      len(pages), status, notebook_id, _now()))
        conn.executemany("INSERT INTO document_pages (document_id, page_number, text) VALUES (?, ?, ?)",
                         [(identifier, number, text) for number, text in enumerate(pages, 1)])
        return _public(conn.execute("SELECT * FROM documents WHERE id = ?", (identifier,)).fetchone(), conn), False


def get(document_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        _table(conn)
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if row is None:
            raise LookupError("Document not found")
        return _public(row, conn)


def file_path(document_id: str) -> tuple[Path, str]:
    record = get(document_id)
    suffix = next(key for key, value in MEDIA_TYPES.items() if value == record["media_type"])
    return _directory() / f"{document_id}{suffix}", str(record["media_type"])


def list_for(notebook_id: str) -> list[dict[str, object]]:
    """Documents in a notebook without their page text."""
    with storage.connect() as conn:
        _table(conn)
        rows = conn.execute("""SELECT id, title, media_type, page_count, status, created_at FROM documents
            WHERE notebook_id = ? ORDER BY created_at DESC""", (notebook_id,)).fetchall()
    return [dict(row) for row in rows]


def pages_for(document_ids: list[str]) -> dict[str, list[tuple[int, str]]]:
    """Page text per document, in page order, for search and chat."""
    if not document_ids:
        return {}
    with storage.connect() as conn:
        _table(conn)
        rows = conn.execute(f"""SELECT document_id, page_number, text FROM document_pages
            WHERE document_id IN ({','.join('?' * len(document_ids))}) ORDER BY document_id, page_number""",
                            document_ids).fetchall()
    pages: dict[str, list[tuple[int, str]]] = {}
    for row in rows:
        pages.setdefault(str(row["document_id"]), []).append((int(row["page_number"]), str(row["text"])))
    return pages


def update(document_id: str, *, title: str | None = None, notebook_id: str | None = None,
           move: bool = False) -> dict[str, object]:
    """Rename a document or move it to another notebook; move with no notebook files it nowhere."""
    with storage.connect() as conn:
        _table(conn)
        if conn.execute("SELECT 1 FROM documents WHERE id = ?", (document_id,)).fetchone() is None:
            raise LookupError("Document not found")
        if title is not None:
            value = " ".join(title.split())
            if not 1 <= len(value) <= 180:
                raise ValueError("Enter a title of at most 180 characters")
            conn.execute("UPDATE documents SET title = ? WHERE id = ?", (value, document_id))
        if move:
            if notebook_id is not None and not conn.execute("SELECT 1 FROM notebooks WHERE id = ?", (notebook_id,)).fetchone():
                raise LookupError("Notebook not found")
            conn.execute("UPDATE documents SET notebook_id = ? WHERE id = ?", (notebook_id, document_id))
    return get(document_id)


def delete(document_id: str) -> None:
    """Remove a document, its page text and its file."""
    path, _ = file_path(document_id)
    with storage.connect() as conn:
        conn.execute("DELETE FROM document_pages WHERE document_id = ?", (document_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    path.unlink(missing_ok=True)
