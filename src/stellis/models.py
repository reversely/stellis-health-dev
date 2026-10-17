"""Download the speech models on first run, verified by SHA-256, with progress the app can show."""

from __future__ import annotations

import hashlib
import shutil
import tarfile
import tempfile
import threading
import urllib.request
from pathlib import Path

from stellis import storage

# name, download URL, SHA-256 of the installed file, member to extract from an archive (if any)
MODELS = (
    ("ggml-small.en.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
     "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d", None),
    ("pyannote-segmentation-3.0-int8.onnx",
     "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",
     "d582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d", "sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx"),
    ("nemo-en-titanet-small.onnx",
     "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx",
     "ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e", None),
)

_STATE = {"state": "idle", "model": None, "progress": 0.0, "error": None}
_LOCK = threading.Lock()
_THREAD: threading.Thread | None = None


def directory() -> Path:
    return storage.data_dir() / "models"


def _installed_path(name: str) -> Path:
    from stellis.processing import model_paths

    overrides = {path.name: path for path in model_paths()}
    return overrides.get(name, directory() / name)


def missing() -> list[str]:
    """Models absent from both their configured path and the models folder."""
    return [name for name, _, _, _ in MODELS
            if not (directory() / name).is_file() and not _installed_path(name).is_file()]


def status() -> dict[str, object]:
    with _LOCK:
        state = dict(_STATE)
    if not missing() and state["state"] != "failed":
        state.update(state="ready", progress=1.0, model=None)
    return state


def _digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            hasher.update(block)
    return hasher.hexdigest()


def _fetch(url: str, target: Path, index: int, count: int) -> None:
    with urllib.request.urlopen(url, timeout=60) as response, target.open("wb") as output:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        for block in iter(lambda: response.read(1 << 20), b""):
            output.write(block)
            done += len(block)
            with _LOCK:
                _STATE["progress"] = (index + (done / total if total else 0)) / count


def install() -> None:
    """Download each missing model; stop at the first failure and leave nothing half-written."""
    folder = directory()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    absent = set(missing())
    needed = [model for model in MODELS if model[0] in absent]
    try:
        for index, (name, url, digest, member) in enumerate(needed):
            with _LOCK:
                _STATE.update(state="downloading", model=name, error=None)
            with tempfile.TemporaryDirectory(dir=folder) as work:
                download = Path(work) / "download"
                _fetch(url, download, index, len(needed))
                candidate = download
                if member:
                    with tarfile.open(download) as archive:
                        archive.extract(member, work, filter="data")
                    candidate = Path(work) / member
                if _digest(candidate) != digest:
                    raise RuntimeError(f"{name} did not match its published checksum")
                candidate.chmod(0o600)
                shutil.move(candidate, folder / name)
        with _LOCK:
            _STATE.update(state="ready", model=None, progress=1.0, error=None)
        _queue_waiting_conversations()
    except Exception as exc:  # Network or disk errors are reported to the app and retried on the next start.
        with _LOCK:
            _STATE.update(state="failed", error=str(exc) or "Download failed")


def _queue_waiting_conversations() -> None:
    """Transcribe recordings imported while the models were still downloading."""
    from stellis import processing

    for item in storage.list_conversations():
        conversation_id = str(item["id"])
        if storage.get_transcript(conversation_id) is None and storage.get_latest_job_for_conversation(conversation_id) is None:
            processing.request_processing(conversation_id)


def ensure_in_background() -> None:
    global _THREAD
    if not missing():
        return
    with _LOCK:
        if _THREAD and _THREAD.is_alive():
            return
        _STATE.update(state="downloading", progress=0.0, error=None)
        _THREAD = threading.Thread(target=install, name="stellis-models", daemon=True)
        _THREAD.start()
