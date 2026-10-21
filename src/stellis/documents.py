"""Uploaded documents: PDFs and images filed into a notebook, with page text.

A digital PDF's text is read on upload. A PDF without a text layer, such as a
scan, and every image keep the status ``needs_text`` until text recognition
exists. The original file stays in the account's data directory and is served
back unchanged.
"""

from __future__ import annotations

import datetime
import hashlib
import io
import pathlib
import re
import uuid

from stellis import storage

MAX_BYTES = 20_000_000
MAX_LABEL = "20 MB"
MAX_PAGES = 300
MAX_TITLE = 180
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

_PDF = "application/pdf"
_SIGNATURES = {
    "application/pdf": b"%PDF-",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
}
# A line shorter than this share of the page's longest line ends a paragraph.
_PARAGRAPH_END = 0.7
_SUMMARY_COLUMNS = ("id, title, media_type, page_count, status, notebook_id, "
                    "record_date, created_at")


class DocumentError(ValueError):
    """An upload cannot become a document. The message is safe to show."""


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _create_tables(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            media_type TEXT NOT NULL,
            sha256 TEXT NOT NULL UNIQUE,
            size INTEGER NOT NULL,
            page_count INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('ready', 'needs_text')),
            notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
            record_date TEXT,
            created_at TEXT NOT NULL)""")
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(documents)")
    }
    if "record_date" not in columns:
        conn.execute("ALTER TABLE documents ADD COLUMN record_date TEXT")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS document_pages (
            document_id TEXT NOT NULL
                REFERENCES documents(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            text TEXT NOT NULL,
            PRIMARY KEY (document_id, page_number))""")


def _directory() -> pathlib.Path:
    path = storage.data_dir() / "documents"
    path.mkdir(exist_ok=True, mode=0o700)
    return path


def _require_notebook(conn, notebook_id: str | None) -> None:
    if notebook_id is None:
        return
    row = conn.execute("SELECT 1 FROM notebooks WHERE id = ?",
                       (notebook_id,)).fetchone()
    if row is None:
        raise LookupError("Notebook not found")


def title_from_filename(filename: str) -> str:
    """Returns a display title: the file name's stem with spacing tidied."""
    stem = pathlib.Path(filename).stem.replace("_", " ")
    return (" ".join(stem.split()) or "Document")[:MAX_TITLE]


def clean_page_text(text: str) -> str:
    """Rejoins lines a PDF wrapped and keeps paragraph breaks.

    Args:
        text: Text extracted from one PDF page.

    Returns:
        The page text with spacing collapsed within lines. A line much
        shorter than the page's longest line ends a paragraph.
    """
    lines = [" ".join(raw.split()) for raw in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return ""
    paragraph_end = _PARAGRAPH_END * max(len(line) for line in lines)
    joined = lines[0]
    for previous, line in zip(lines, lines[1:]):
        joined += ("\n" if len(previous) < paragraph_end else " ") + line
    return joined


def check_upload(filename: str, content: bytes) -> str:
    """Validates an upload's type and size.

    Args:
        filename: The uploaded file's name.
        content: The file's bytes.

    Returns:
        The file's media type.

    Raises:
        DocumentError: The file is empty, too large, of another type, or its
            first bytes do not match its extension.
    """
    suffix = pathlib.PurePath(filename or "").suffix.lower()
    media_type = MEDIA_TYPES.get(suffix)
    if media_type is None:
        raise DocumentError("Choose a PDF, PNG or JPEG file")
    if not content:
        raise DocumentError("The file is empty")
    if len(content) > MAX_BYTES:
        raise DocumentError(f"Upload a document of at most {MAX_LABEL}")
    if not content.startswith(_SIGNATURES[media_type]):
        raise DocumentError(f"This file is not a {suffix[1:].upper()} file")
    return media_type


def _read_pdf_pages(content: bytes) -> list[str]:
    import pypdf  # Deferred: only PDF uploads need it.
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        encrypted = reader.is_encrypted
        pages = [] if encrypted else list(reader.pages)
    except (pypdf.errors.PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise DocumentError("This PDF could not be read") from exc
    if encrypted:
        raise DocumentError("Remove the PDF password and upload it again")
    if len(pages) > MAX_PAGES:
        raise DocumentError(f"Upload a PDF of at most {MAX_PAGES} pages")
    try:
        return [clean_page_text(page.extract_text() or "") for page in pages]
    except (pypdf.errors.PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise DocumentError("This PDF could not be read") from exc


def _check_image(content: bytes) -> None:
    from PIL import Image  # Deferred: only image uploads need it.
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
    except (Image.UnidentifiedImageError, OSError, ValueError) as exc:
        raise DocumentError("This image could not be read") from exc


def _record(conn, row) -> dict[str, object]:
    record = {
        key: row[key] for key in ("id", "title", "filename", "media_type",
                                 "size", "page_count", "status", "notebook_id",
                                 "record_date", "created_at")
    }
    pages = conn.execute(
        "SELECT page_number, text FROM document_pages "
        "WHERE document_id = ? ORDER BY page_number", (row["id"],))
    record["pages"] = [{
        "number": page["page_number"],
        "text": page["text"]
    } for page in pages]
    return record


def create(filename: str,
           content: bytes,
           notebook_id: str | None = None,
           record_date: str | None = None) -> tuple[dict[str, object], bool]:
    """Stores an uploaded PDF or image with its page text.

    Args:
        filename: The uploaded file's name.
        content: The file's bytes.
        notebook_id: The notebook to file the document in, or None.
        record_date: The date the document describes, as YYYY-MM-DD, or None.

    Returns:
        The document, with its pages, and whether the account already had the
        same file. A repeated upload returns the stored document unchanged.

    Raises:
        DocumentError: The file cannot become a document.
        LookupError: The notebook does not exist.
    """
    media_type = check_upload(filename, content)
    digest = hashlib.sha256(content).hexdigest()
    with storage.connect() as conn:
        _create_tables(conn)
        existing = conn.execute("SELECT * FROM documents WHERE sha256 = ?",
                                (digest,)).fetchone()
        if existing:
            return _record(conn, existing), True
        _require_notebook(conn, notebook_id)
    if media_type == _PDF:
        pages = _read_pdf_pages(content)
    else:
        _check_image(content)
        pages = [""]
    document_id = str(uuid.uuid4())
    path = _directory() / (document_id +
                           pathlib.PurePath(filename).suffix.lower())
    path.write_bytes(content)
    path.chmod(0o600)
    with storage.connect() as conn:
        _create_tables(conn)
        conn.execute(
            """
            INSERT INTO documents (id, title, filename, media_type, sha256,
                size, page_count, status, notebook_id, record_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (document_id, title_from_filename(filename),
             pathlib.PurePath(filename).name[:255], media_type, digest,
             len(content), len(pages), "ready" if any(pages) else "needs_text",
             notebook_id, record_date, _now()))
        conn.executemany(
            "INSERT INTO document_pages (document_id, page_number, text) "
            "VALUES (?, ?, ?)", [(document_id, number, text)
                                 for number, text in enumerate(pages, 1)])
        row = conn.execute("SELECT * FROM documents WHERE id = ?",
                           (document_id,)).fetchone()
        return _record(conn, row), False


def get(document_id: str) -> dict[str, object]:
    """Returns one document with its pages.

    Raises:
        LookupError: The document does not exist.
    """
    with storage.connect() as conn:
        _create_tables(conn)
        row = conn.execute("SELECT * FROM documents WHERE id = ?",
                           (document_id,)).fetchone()
        if row is None:
            raise LookupError("Document not found")
        return _record(conn, row)


def file_path(document_id: str) -> tuple[pathlib.Path, str]:
    """Returns the stored file's path and media type.

    Raises:
        LookupError: The document does not exist.
    """
    media_type = str(get(document_id)["media_type"])
    suffix = next(
        key for key, value in MEDIA_TYPES.items() if value == media_type)
    return _directory() / (document_id + suffix), media_type


def list_all(notebook_id: str | None = None) -> list[dict[str, object]]:
    """Lists documents without page text, newest record date first.

    Args:
        notebook_id: Limits the list to one notebook when given.

    Returns:
        One dict per document. Documents without a record date sort by upload
        time.
    """
    where, arguments = ("WHERE notebook_id = ?",
                        (notebook_id,)) if notebook_id else ("", ())
    with storage.connect() as conn:
        _create_tables(conn)
        rows = conn.execute(
            f"SELECT {_SUMMARY_COLUMNS} FROM documents {where} "
            "ORDER BY COALESCE(record_date, created_at) DESC", arguments)
        return [dict(row) for row in rows]


def all_pages(document_ids: list[str] | None = None) -> list[dict[str, object]]:
    """Lists page text for search and chat, in document and page order.

    Args:
        document_ids: Limits the pages to these documents when given.

    Returns:
        One dict per page with ``document_id``, ``title``, ``notebook_id``,
        ``number`` and ``text``.
    """
    if document_ids is not None and not document_ids:
        return []
    where, arguments = "", ()
    if document_ids is not None:
        where = f"WHERE d.id IN ({','.join('?' * len(document_ids))})"
        arguments = tuple(document_ids)
    with storage.connect() as conn:
        _create_tables(conn)
        rows = conn.execute(
            f"""
            SELECT d.id AS document_id, d.title, d.notebook_id,
                   p.page_number AS number, p.text
            FROM documents d JOIN document_pages p ON p.document_id = d.id
            {where}
            ORDER BY d.created_at DESC, d.id, p.page_number""", arguments)
        return [dict(row) for row in rows]


def update(document_id: str,
           *,
           title: str | None = None,
           record_date: str | None = None,
           notebook_id: str | None = None,
           move: bool = False) -> dict[str, object]:
    """Renames, dates or moves a document.

    Args:
        document_id: The document to change.
        title: A new title, or None to keep it.
        record_date: A new record date as YYYY-MM-DD, or None to keep it.
        notebook_id: The notebook to move to when ``move`` is set; None files
            the document in no notebook.
        move: Whether to change the notebook.

    Returns:
        The document after the change.

    Raises:
        LookupError: The document or the notebook does not exist.
        ValueError: The title or the date is not valid.
    """
    changes: dict[str, object] = {}
    if title is not None:
        value = " ".join(title.split())
        if not 1 <= len(value) <= MAX_TITLE:
            raise ValueError(f"Enter a title of at most {MAX_TITLE} characters")
        changes["title"] = value
    if record_date is not None:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", record_date):
            raise ValueError("Enter the record date as YYYY-MM-DD")
        changes["record_date"] = record_date
    if move:
        changes["notebook_id"] = notebook_id
    with storage.connect() as conn:
        _create_tables(conn)
        if conn.execute("SELECT 1 FROM documents WHERE id = ?",
                        (document_id,)).fetchone() is None:
            raise LookupError("Document not found")
        if move:
            _require_notebook(conn, notebook_id)
        for column, value in changes.items():
            # Column names come from the fixed keys above, never from input.
            conn.execute(f"UPDATE documents SET {column} = ? WHERE id = ?",
                         (value, document_id))
    return get(document_id)


def delete(document_id: str) -> None:
    """Removes a document, its page text and its file.

    Raises:
        LookupError: The document does not exist.
    """
    path, _ = file_path(document_id)
    with storage.connect() as conn:
        conn.execute("DELETE FROM document_pages WHERE document_id = ?",
                     (document_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    path.unlink(missing_ok=True)
