"""Sample meetings from the AMI Meeting Corpus, added from the app.

The AMI Meeting Corpus is published by the University of Edinburgh under the
Creative Commons Attribution 4.0 licence (https://groups.inf.ed.ac.uk/ami/corpus/license.shtml).
Each sample is a four-person design meeting played by actors. Stellis downloads
the mixed headset recording, checks its SHA-256 digest, converts it to MP3, and
imports it like any other recording, so transcription runs as usual.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import tempfile
import threading
import urllib.request
from pathlib import Path

from starlette.datastructures import UploadFile

from stellis import importer, library, notes, processing, storage, tools

SOURCE = "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/{id}/audio/{id}.Mix-Headset.wav"
SAMPLES = (
    ("ES2002a", "Remote control design kickoff", "9c76866990fcc8b84006dc32d273ad99df439090b748ebe72103bb78c3216ee7"),
    ("IS1008a", "Product team introductions and goals", "75ae8796ca2177fa0c77055de2fe2f95325b412dc7152a9b32c76c9884a3d382"),
    ("TS3003a", "New remote control project planning", "b6ce59ff735c234afdd94b13744aa26f6785af746170543fd03b33160e920a6d"),
)
CREDIT = ("Sample meeting {id} from the AMI Meeting Corpus, University of Edinburgh, "
          "licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). "
          "The participants are actors in a design scenario.")

_STATE = {"state": "idle", "meeting": None, "progress": 0.0, "error": None}
_LOCK = threading.Lock()
_THREAD: threading.Thread | None = None


def _cache() -> Path:
    return storage.data_dir() / "sample-downloads"


def _index_path() -> Path:
    return storage.data_dir() / "samples.json"


def _index() -> dict[str, str]:
    """Sample meeting id to the conversation it became."""
    try:
        return json.loads(_index_path().read_text())
    except (OSError, ValueError):
        return {}


def added() -> list[str]:
    """Samples whose conversation is still in the library (not deleted)."""
    present = {str(item["id"]) for item in storage.list_conversations()}
    return [meeting for meeting, conversation in _index().items() if conversation in present]


def status() -> dict[str, object]:
    with _LOCK:
        state = dict(_STATE)
    return {**state, "added": added(), "total": len(SAMPLES)}


def _set(**values: object) -> None:
    with _LOCK:
        _STATE.update(values)


def _download(meeting: str, digest: str, index: int, count: int, cache: Path) -> Path:
    path = cache / f"{meeting}.Mix-Headset.wav"
    if not path.is_file():
        partial = path.with_suffix(".part")
        with urllib.request.urlopen(SOURCE.format(id=meeting), timeout=60) as response, partial.open("wb") as output:
            total = int(response.headers.get("Content-Length") or 0)
            done = 0
            for block in iter(lambda: response.read(1 << 20), b""):
                output.write(block)
                done += len(block)
                _set(progress=(index + (done / total if total else 0)) / count)
        partial.replace(path)
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(block)
    if hasher.hexdigest() != digest:
        path.unlink()
        raise RuntimeError(f"{meeting} did not match its published checksum")
    return path


def _to_mp3(source: Path, target: Path) -> None:
    subprocess.run([tools.ffmpeg(), "-nostdin", "-v", "error", "-y", "-i", str(source), "-ac", "1", "-q:a", "4", str(target)],
                   check=True, timeout=600)


async def _import(path: Path, filename: str) -> tuple[dict[str, object], bool]:
    with path.open("rb") as handle:
        return await importer.import_upload(UploadFile(file=handle, filename=filename))


def _meetings_category() -> str:
    """Every AMI sample is a meeting, so it is filed under Meetings for the home page groups."""
    for category in library.categories():
        if str(category["name"]).casefold() == "meetings":
            return str(category["id"])
    return str(library.create_category("Meetings")["id"])


def install(cache: Path | None = None) -> None:
    """Add every sample not already in the library; stop at the first failure."""
    cache = cache or _cache()
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    present = set(added())
    needed = [sample for sample in SAMPLES if sample[0] not in present]
    ready = processing.capabilities()["features"]
    try:
        with tempfile.TemporaryDirectory(dir=storage.data_dir()) as folder:
            for index, (meeting, title, digest) in enumerate(needed):
                _set(state="downloading", meeting=title, error=None)
                mp3 = Path(folder) / f"{meeting}.mp3"
                _to_mp3(_download(meeting, digest, index, len(needed), cache), mp3)
                record, duplicate = asyncio.run(_import(mp3, f"{meeting}.mp3"))
                conversation_id = str(record["id"])
                if not duplicate:
                    storage.rename_conversation(conversation_id, f"{title} (AMI {meeting})")
                    notes.save("conversation", conversation_id, CREDIT.format(id=meeting), 0)
                    library.set_category(conversation_id, _meetings_category(), True)
                    # Without the speech models yet, models.install queues it once they arrive.
                    if ready["transcribe"] and ready["diarize"]:
                        processing.request_processing(conversation_id)
                index_data = _index()
                index_data[meeting] = conversation_id
                _index_path().write_text(json.dumps(index_data))
        _set(state="done", meeting=None, progress=1.0, error=None)
    except Exception as exc:  # Network, disk, or decode errors are shown in the app, which offers a retry.
        _set(state="failed", error=str(exc) or "Download failed")


def start() -> dict[str, object]:
    global _THREAD
    with _LOCK:
        if not (_THREAD and _THREAD.is_alive()):
            _STATE.update(state="downloading", meeting=None, progress=0.0, error=None)
            _THREAD = threading.Thread(target=install, name="stellis-samples", daemon=True)
            _THREAD.start()
    return status()
