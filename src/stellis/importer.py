"""Validated local audio and Otter ZIP import."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from stellis import storage

MAX_UPLOAD_BYTES = 1_000_000_000
MAX_AUDIO_BYTES = 1_000_000_000
MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".flac": "audio/flac",
}


class ImportFailure(ValueError):
    """An uploaded file cannot become a conversation."""


def _new_temp(root: Path) -> Path:
    descriptor, name = tempfile.mkstemp(prefix=".import-", dir=root)
    os.close(descriptor)
    return Path(name)


def _copy_limited(source, destination: Path, limit: int) -> str:
    """Copy a stream while enforcing a size limit and calculating SHA-256."""
    digest = hashlib.sha256()
    total = 0
    with destination.open("wb") as output:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise ImportFailure("The file is larger than the 1 GB import limit.")
            digest.update(chunk)
            output.write(chunk)
    if total == 0:
        raise ImportFailure("The file is empty.")
    return digest.hexdigest()


def _audio_from_zip(archive_path: Path, root: Path) -> tuple[Path, str, str]:
    try:
        with zipfile.ZipFile(archive_path) as archive:
            candidates = [
                item for item in archive.infolist()
                if not item.is_dir()
                and not item.filename.startswith("__MACOSX/")
                and Path(item.filename).suffix.lower() in MEDIA_TYPES
            ]
            if len(candidates) != 1:
                raise ImportFailure("The ZIP must contain exactly one supported audio file.")
            item = candidates[0]
            if item.file_size > MAX_AUDIO_BYTES:
                raise ImportFailure("The audio file is larger than the 1 GB import limit.")
            audio_path = _new_temp(root)
            try:
                with archive.open(item) as audio:
                    digest = _copy_limited(audio, audio_path, MAX_AUDIO_BYTES)
            except Exception:
                audio_path.unlink(missing_ok=True)
                raise
            return audio_path, Path(item.filename).name, digest
    except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
        raise ImportFailure("The ZIP could not be read.") from exc


def _duration_ms(path: Path) -> int:
    try:
        completed = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
                "-of", "json", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=True,
        )
        metadata = json.loads(completed.stdout)
        if not any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", [])):
            raise ImportFailure("The file has no audio stream.")
        duration = round(float(metadata["format"]["duration"]) * 1000)
        if duration <= 0:
            raise ImportFailure("The audio duration is invalid.")
        return duration
    except FileNotFoundError as exc:
        raise ImportFailure("ffprobe is unavailable on this device.") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, KeyError, ValueError) as exc:
        raise ImportFailure("The audio file could not be decoded.") from exc


def _title(filename: str) -> str:
    stem = Path(filename).stem
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", stem).strip()
    return cleaned[:180] or "Untitled recording"


async def import_upload(upload: UploadFile) -> tuple[dict[str, object], bool]:
    """Import one audio file from a browser upload, or return its existing record."""
    root = storage.data_dir()
    incoming = _new_temp(root)
    audio_path: Path | None = None
    try:
        with incoming.open("wb") as output:
            total = 0
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise ImportFailure("The upload is larger than the 1 GB limit.")
                output.write(chunk)
        if total == 0:
            raise ImportFailure("The file is empty.")

        original_name = Path(upload.filename or "").name
        suffix = Path(original_name).suffix.lower()
        if suffix == ".zip":
            audio_path, audio_name, digest = _audio_from_zip(incoming, root)
            suffix = Path(audio_name).suffix.lower()
        elif suffix in MEDIA_TYPES:
            audio_path = incoming
            audio_name = original_name
            with incoming.open("rb") as source:
                digest = hashlib.file_digest(source, "sha256").hexdigest()
        else:
            raise ImportFailure("Choose MP3, WAV, M4A, OGG, WebM, FLAC, or an Otter ZIP.")

        existing = storage.find_by_hash(digest)
        if existing:
            if existing.get("trashed_at"):
                raise ImportFailure("This recording is in Trash. Restore it before importing again.")
            return existing, True
        duration_ms = _duration_ms(audio_path)
        conversation_id = str(uuid.uuid4())
        media_dir = root / "media"
        media_dir.mkdir(exist_ok=True, mode=0o700)
        media_dir.chmod(0o700)
        audio_filename = f"{conversation_id}{suffix}"
        destination = media_dir / audio_filename
        try:
            shutil.copyfile(audio_path, destination)
            destination.chmod(0o600)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        record: dict[str, object] = {
            "id": conversation_id,
            "title": _title(audio_name),
            "source_sha256": digest,
            "audio_filename": audio_filename,
            "audio_media_type": MEDIA_TYPES[suffix],
            "duration_ms": duration_ms,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            storage.add_conversation(record)
        except sqlite3.IntegrityError:
            destination.unlink(missing_ok=True)
            existing = storage.find_by_hash(digest)
            if existing:
                if existing.get("trashed_at"):
                    raise ImportFailure("This recording is in Trash. Restore it before importing again.")
                return existing, True
            raise
        return record, False
    finally:
        incoming.unlink(missing_ok=True)
        if audio_path is not None and audio_path != incoming:
            audio_path.unlink(missing_ok=True)
        await upload.close()
