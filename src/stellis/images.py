"""Private, time-anchored screenshots for recordings and conversations."""

from __future__ import annotations

import hashlib
import io
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from stellis import storage

MAX_UPLOAD_BYTES = 12_000_000
MAX_STORED_BYTES = 12_000_000
MAX_PIXELS = 20_000_000
MAX_SIDE = 8192
MAX_CAPTION = 280
ACCEPTED_FORMATS = {"PNG", "JPEG", "WEBP"}


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _directory() -> Path:
    root = storage.data_dir() / "images"
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    return root


def _owner(conn, scope: str, item_id: str):
    if scope == "recording":
        row = conn.execute("SELECT id, state FROM recording_sessions WHERE id = ?", (item_id,)).fetchone()
        if not row or row["state"] != "recording":
            raise LookupError("Active recording not found")
    elif scope == "conversation":
        row = conn.execute("SELECT id, duration_ms FROM conversations WHERE id = ? AND trashed_at IS NULL",
                           (item_id,)).fetchone()
        if not row:
            raise LookupError("Conversation not found")
    else:
        raise ValueError("Invalid image scope")
    return row


def _field(scope: str) -> str:
    return "recording_id" if scope == "recording" else "conversation_id"


def _public(row) -> dict[str, object]:
    return {key: row[key] for key in ("id", "media_position_ms", "segment_id", "caption",
                                      "width", "height", "size_bytes", "created_at", "updated_at")}


def _normalize(data: bytes) -> tuple[bytes, int, int]:
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("Image must be smaller than 12 MB")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in ACCEPTED_FORMATS or getattr(source, "is_animated", False):
                raise ValueError("Use a PNG, JPEG, or WebP image")
            width, height = source.size
            if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
                raise ValueError("Image dimensions are too large")
            source.load()
            oriented = ImageOps.exif_transpose(source)
            # Re-encode decoded pixels: uploaded metadata and embedded profiles do not survive.
            pixels = oriented.convert("RGBA" if "A" in oriented.getbands() else "RGB")
            output = io.BytesIO()
            pixels.save(output, format="WEBP", lossless=True, method=4)
            encoded = output.getvalue()
            if len(encoded) > MAX_STORED_BYTES:
                raise ValueError("Image is too large after conversion")
            return encoded, pixels.width, pixels.height
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Image could not be opened") from exc


def list_images(scope: str, item_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        _owner(conn, scope, item_id)
        rows = conn.execute(f"""SELECT * FROM conversation_images WHERE {_field(scope)} = ?
            ORDER BY media_position_ms, created_at, id""", (item_id,)).fetchall()
    return [_public(row) for row in rows]


def add(scope: str, item_id: str, data: bytes, media_position_ms: int,
        segment_id: str | None = None, caption: str = "") -> dict[str, object]:
    if media_position_ms < 0 or media_position_ms > 86_400_000:
        raise ValueError("Invalid image time")
    if len(caption.strip()) > MAX_CAPTION:
        raise ValueError("Caption is too long")
    normalized, width, height = _normalize(data)
    image_id = str(uuid.uuid4())
    filename = f"{image_id}.webp"
    directory = _directory()
    descriptor, temporary_name = tempfile.mkstemp(prefix=".image-", dir=directory)
    temporary = Path(temporary_name)
    destination = directory / filename
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(normalized)
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(0o600)
        with storage.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            owner = _owner(conn, scope, item_id)
            if scope == "conversation":
                if media_position_ms > int(owner["duration_ms"]):
                    raise ValueError("Image time exceeds recording length")
                if segment_id:
                    transcript = conn.execute("SELECT segments_json FROM transcripts WHERE conversation_id = ?",
                                              (item_id,)).fetchone()
                    segments = json.loads(str(transcript["segments_json"])) if transcript else []
                    selected = next((segment for segment in segments if segment["id"] == segment_id), None)
                    if selected is None:
                        raise ValueError("Transcript passage changed; choose it again")
                    media_position_ms = int(selected["start_ms"])
            elif segment_id:
                raise ValueError("A live image cannot use a final passage ID")
            stamp = _stamp()
            os.replace(temporary, destination)
            conn.execute(f"""INSERT INTO conversation_images
                (id, {_field(scope)}, media_position_ms, segment_id, caption, filename, media_type,
                 size_bytes, width, height, sha256, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?, ?)""",
                (image_id, item_id, media_position_ms, segment_id, caption.strip(), filename,
                 len(normalized), width, height, hashlib.sha256(normalized).hexdigest(), stamp, stamp))
        return get(scope, item_id, image_id)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)


def get(scope: str, item_id: str, image_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        _owner(conn, scope, item_id)
        row = conn.execute(f"SELECT * FROM conversation_images WHERE id = ? AND {_field(scope)} = ?",
                           (image_id, item_id)).fetchone()
    if row is None:
        raise LookupError("Image not found")
    return dict(row)


def path_for(record: dict[str, object]) -> Path:
    image_id = str(uuid.UUID(str(record["id"])))
    return _directory() / f"{image_id}.webp"


def update_caption(scope: str, item_id: str, image_id: str, caption: str) -> dict[str, object]:
    value = caption.strip()
    if len(value) > MAX_CAPTION:
        raise ValueError("Caption is too long")
    with storage.connect() as conn:
        _owner(conn, scope, item_id)
        changed = conn.execute(f"""UPDATE conversation_images SET caption = ?, updated_at = ?
            WHERE id = ? AND {_field(scope)} = ?""", (value, _stamp(), image_id, item_id)).rowcount
    if not changed:
        raise LookupError("Image not found")
    return _public(get(scope, item_id, image_id))


def delete(scope: str, item_id: str, image_id: str) -> None:
    record = get(scope, item_id, image_id)
    with storage.connect() as conn:
        conn.execute(f"DELETE FROM conversation_images WHERE id = ? AND {_field(scope)} = ?", (image_id, item_id))
    path_for(record).unlink(missing_ok=True)


def attach_to_conversation(recording_id: str, conversation_id: str, duration_ms: int) -> None:
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("""UPDATE conversation_images SET conversation_id = ?, recording_id = NULL,
            media_position_ms = MIN(media_position_ms, ?), updated_at = ? WHERE recording_id = ?""",
                     (conversation_id, duration_ms, _stamp(), recording_id))


def remove_files(image_ids: list[str]) -> None:
    for image_id in image_ids:
        (_directory() / f"{image_id}.webp").unlink(missing_ok=True)


def recover_orphans() -> None:
    with storage.connect() as conn:
        known = {str(row["id"]) for row in conn.execute("SELECT id FROM conversation_images")}
    for file in _directory().iterdir():
        if file.name.startswith(".image-") or (file.suffix == ".webp" and file.stem not in known):
            file.unlink(missing_ok=True)
