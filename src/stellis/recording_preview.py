"""Bounded provisional ASR from durable browser recording chunks."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

import soundfile as sf

from stellis import processing, recording, storage

WINDOW_CHUNKS = 20
_LOCK = threading.Lock()


def _packets(path: Path) -> list[float]:
    completed = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "packet=pts_time",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return [float(value) for line in completed.stdout.splitlines()
            if (value := line.split(",", 1)[0]) and value != "N/A"]


def _snapshot(recording_id: str) -> tuple[list[dict[str, object]], int]:
    with storage.connect() as conn:
        session = conn.execute("SELECT state FROM recording_sessions WHERE id = ?", (recording_id,)).fetchone()
        if session is None:
            raise LookupError("Recording session not found")
        if session["state"] != "recording":
            raise RuntimeError("Recording is already finalized")
        rows = [dict(row) for row in conn.execute(
            "SELECT sequence, size_bytes, sha256 FROM recording_chunks WHERE recording_id = ? ORDER BY sequence",
            (recording_id,),
        )]
    if [row["sequence"] for row in rows] != list(range(len(rows))):
        raise RuntimeError("Recording chunks are incomplete")
    return rows, len(rows) - 1


def _stored(recording_id: str) -> dict[str, object]:
    path = recording._directory(recording_id) / "preview.json"
    if not path.exists():
        return {"state": "waiting", "through_sequence": -1, "segments": []}
    return json.loads(path.read_text())


def latest(recording_id: str) -> dict[str, object]:
    """Read the last provisional result without starting model work."""
    if recording.get_session(recording_id) is None:
        raise LookupError("Recording session not found")
    return _stored(recording_id)


def generate(recording_id: str) -> dict[str, object]:
    """Transcribe at most the recent 20 saved seconds with the local model."""
    with _LOCK:
        rows, through = _snapshot(recording_id)
        prior = _stored(recording_id)
        if through < 2 or through <= int(prior.get("through_sequence", -1)) + 3:
            return prior
        model = processing.model_paths()[0]
        if not (shutil.which("ffmpeg") and shutil.which("ffprobe")
                and shutil.which("whisper-cli") and model.is_file()):
            raise RuntimeError("Local transcription model unavailable")
        directory = recording._directory(recording_id)
        selected = rows if len(rows) <= WINDOW_CHUNKS + 1 else [rows[0], *rows[-WINDOW_CHUNKS:]]
        with tempfile.TemporaryDirectory(prefix="preview-", dir=directory) as temp_name:
            temp = Path(temp_name)
            joined = temp / f"window{recording.RECORDING_TYPES[str(recording.get_session(recording_id)['media_type'])]}"
            with joined.open("wb") as output:
                for row in selected:
                    source = directory / f"{row['sequence']:08d}.chunk"
                    data = source.read_bytes()
                    if len(data) != row["size_bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
                        raise RuntimeError("A saved recording chunk failed integrity verification")
                    output.write(data)
            window_times = _packets(joined)
            if not window_times:
                raise RuntimeError("Could not locate recording audio")
            start_seconds = max(0.0, window_times[-1] - 30.0)
            if len(selected) < len(rows):
                first = directory / "00000000.chunk"
                first_times = _packets(first)
                if not first_times:
                    raise RuntimeError("Could not locate the recording preview window")
                # The first chunk supplies the WebM header. Later clusters retain original media PTS.
                tail = next((value for value in window_times if value > first_times[-1] + 1.0), None)
                if tail is None:
                    raise RuntimeError("Could not locate recent recording audio")
                start_seconds = max(start_seconds, tail)
            wav = temp / "window.wav"
            subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{start_seconds:.3f}",
                 "-i", str(joined), "-ar", "16000", "-ac", "1", str(wav)],
                check=True, capture_output=True, timeout=60,
            )
            audio, rate = sf.read(wav, dtype="float32")
            window_end_ms = round(start_seconds * 1000) + round(len(audio) / rate * 1000)
            if rate != 16000 or len(audio) < 16000:
                segments: list[dict[str, object]] = []
            elif float((audio * audio).mean()) < 0.000001:
                segments = []
            else:
                result_base = temp / "words"
                command = ["whisper-cli", "-m", str(model), "-f", str(wav), "-l", "en",
                           "-t", "4", "-ojf", "-of", str(result_base), "-np"]
                vocabulary = processing.vocabulary_snapshot()
                if vocabulary:
                    command.extend(["--prompt", "Vocabulary: " + ", ".join(vocabulary)])
                subprocess.run(command, check=True, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE, timeout=180)
                payload = json.loads(result_base.with_suffix(".json").read_text())
                segments = []
                for item in payload.get("transcription", []):
                    start_ms = round(start_seconds * 1000) + int(item["offsets"]["from"])
                    end_ms = min(window_end_ms, round(start_seconds * 1000) + int(item["offsets"]["to"]))
                    text = str(item.get("text", "")).strip()
                    if text and start_ms < end_ms:
                        segments.append({"start_ms": start_ms, "end_ms": end_ms, "text": text})
        kept = [item for item in prior.get("segments", [])
                if int(item["end_ms"]) <= round(start_seconds * 1000)]
        result: dict[str, object] = {"state": "ready", "through_sequence": through,
                                     "segments": [*kept, *segments]}
        if recording.get_session(recording_id)["state"] != "recording":
            return result
        fd, name = tempfile.mkstemp(prefix=".preview-", dir=directory)
        try:
            with os.fdopen(fd, "w") as output:
                json.dump(result, output, ensure_ascii=False)
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, directory / "preview.json")
        finally:
            Path(name).unlink(missing_ok=True)
        return result
