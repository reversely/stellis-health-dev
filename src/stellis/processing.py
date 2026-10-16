"""Durable, on-device transcription and acoustic diarization jobs."""

from __future__ import annotations

import json
import hashlib
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import soundfile as sf

from stellis import storage

PIPELINE_VERSION = "whisper-small-en-sherpa-pyannote3-titanet-v1"
_QUEUE: queue.Queue[str] = queue.Queue()
_WORKER_LOCK = threading.Lock()
_REQUEST_LOCK = threading.Lock()
_WORKER: threading.Thread | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_paths() -> tuple[Path, Path, Path]:
    """Resolve model locations without shipping large binaries in Git."""
    root = storage.data_dir() / "models"
    return (
        Path(os.environ.get("STELLIS_WHISPER_MODEL", root / "ggml-small.en.bin")).expanduser(),
        Path(os.environ.get("STELLIS_SEGMENTATION_MODEL", root / "pyannote-segmentation-3.0-int8.onnx")).expanduser(),
        Path(os.environ.get("STELLIS_EMBEDDING_MODEL", root / "nemo-en-titanet-small.onnx")).expanduser(),
    )


def capabilities() -> dict[str, object]:
    """Report actual installed engine readiness to any client."""
    whisper, segmentation, embedding = model_paths()
    asr_ready = bool(shutil.which("whisper-cli") and whisper.is_file() and shutil.which("ffmpeg"))
    diar_ready = segmentation.is_file() and embedding.is_file()
    return {
        "pipeline_version": pipeline_version(),
        "engines": [
            {"id": "whisper.cpp", "kind": "asr", "model": whisper.name, "languages": ["en"], "ready": asr_ready},
            {"id": "sherpa-onnx", "kind": "diarization", "model": f"{segmentation.name} + {embedding.name}", "languages": [], "ready": diar_ready},
        ],
        "features": {"transcribe": asr_ready, "diarize": diar_ready},
    }


def vocabulary_snapshot() -> list[str]:
    """Return the saved terms that a new ASR job will use."""
    return [str(item["term"]) for item in storage.list_vocabulary()]


def pipeline_version(terms: list[str] | None = None) -> str:
    """Include vocabulary in job identity without changing old transcripts."""
    terms = vocabulary_snapshot() if terms is None else terms
    if not terms:
        return PIPELINE_VERSION
    digest = hashlib.sha256(json.dumps(terms, ensure_ascii=False).encode()).hexdigest()[:12]
    return f"{PIPELINE_VERSION}-vocab-{digest}"


def public_job(record: dict[str, object]) -> dict[str, object]:
    """Exclude internal database fields and decode metrics."""
    return {
        key: record[key]
        for key in ("id", "conversation_id", "pipeline_version", "state", "stage", "progress", "error", "created_at", "updated_at")
    } | {"metrics": json.loads(str(record["metrics_json"])) if record["metrics_json"] else None}


def start_worker() -> None:
    """Start one device worker and retry unfinished jobs after a restart."""
    global _WORKER
    with _WORKER_LOCK:
        if _WORKER and _WORKER.is_alive():
            return
        _WORKER = threading.Thread(target=_worker_loop, name="stellis-speech", daemon=True)
        _WORKER.start()
        for job in storage.list_pending_jobs():
            storage.update_job(str(job["id"]), state="queued", stage="resuming", updated_at=now())
            _QUEUE.put(str(job["id"]))


def request_processing(conversation_id: str) -> dict[str, object]:
    """Queue one job per conversation and pipeline version."""
    with _REQUEST_LOCK:
        terms = vocabulary_snapshot()
        version = pipeline_version(terms)
        existing = storage.get_job_for_conversation(conversation_id, version)
        if existing:
            if existing["state"] == "failed":
                storage.update_job(str(existing["id"]), state="queued", stage="retrying", progress=0,
                                   error=None, updated_at=now())
                _QUEUE.put(str(existing["id"]))
                return storage.get_job(str(existing["id"])) or existing
            return existing
        stamp = now()
        record: dict[str, object] = {
            "id": str(uuid.uuid4()), "conversation_id": conversation_id,
            "pipeline_version": version, "state": "queued", "stage": "queued",
            "progress": 0, "error": None, "metrics_json": None,
            "vocabulary_json": json.dumps(terms, ensure_ascii=False),
            "created_at": stamp, "updated_at": stamp,
        }
        storage.add_job(record)
        _QUEUE.put(str(record["id"]))
        return record


def _worker_loop() -> None:
    while True:
        job_id = _QUEUE.get()
        try:
            completed = subprocess.run(
                [sys.executable, "-m", "stellis.worker", job_id],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=14400,
            )
            if completed.returncode:
                storage.update_job(job_id, state="failed", stage="failed",
                                   error="Speech worker exited unexpectedly", updated_at=now())
        except Exception:
            # Keep the queue alive even if persistence or a native adapter fails unexpectedly.
            try:
                storage.update_job(job_id, state="failed", stage="failed",
                                   error="Unexpected processing failure", updated_at=now())
            except Exception:
                pass
        finally:
            _QUEUE.task_done()


def _stage(job_id: str, name: str, progress: float) -> None:
    storage.update_job(job_id, state="running", stage=name, progress=progress, updated_at=now())


def _command(command: list[str], timeout: int) -> None:
    completed = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                               text=True, timeout=timeout)
    if completed.returncode:
        # Native-tool diagnostics may include private file paths or speech text.
        raise RuntimeError(f"{Path(command[0]).name} failed (exit {completed.returncode})")


def _transcribe(audio_path: Path, model: Path, output_base: Path,
                vocabulary: list[str]) -> list[dict[str, object]]:
    command = ["whisper-cli", "-m", str(model), "-f", str(audio_path), "-l", "en",
               "-t", "4", "-ojf", "-of", str(output_base), "-np"]
    if vocabulary:
        command.extend(["--prompt", "Vocabulary: " + ", ".join(vocabulary)])
    _command(command, timeout=7200)
    result = json.loads(output_base.with_suffix(".json").read_text())
    segments: list[dict[str, object]] = []
    for item in result["transcription"]:
        start = int(item["offsets"]["from"])
        end = int(item["offsets"]["to"])
        if end > start and str(item["text"]).strip():
            segments.append({"start_ms": start, "end_ms": end, "text": str(item["text"]).strip()})
    if not segments:
        raise RuntimeError("The on-device model returned no speech segments")
    return segments


def _diarize(audio_path: Path, segmentation: Path, embedding: Path, job_id: str) -> list[dict[str, object]]:
    import sherpa_onnx

    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(segmentation), window_shift_ratio=0.1,
            ),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(embedding)),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=0.8),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise RuntimeError("Speaker model configuration is invalid")
    audio, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    if sample_rate != 16000:
        raise RuntimeError("Decoded audio must be 16 kHz")
    diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    last_bucket = -1

    def on_progress(done: int, total: int) -> int:
        nonlocal last_bucket
        bucket = int(done * 10 / max(1, total))
        if bucket != last_bucket:
            last_bucket = bucket
            _stage(job_id, "diarizing", 0.55 + 0.4 * done / max(1, total))
        return 0

    result = diarizer.process(audio[:, 0], callback=on_progress).sort_by_start_time()
    return [
        {"start_ms": round(turn.start * 1000), "end_ms": round(turn.end * 1000),
         "speaker_cluster_id": f"speaker-{turn.speaker + 1}"}
        for turn in result if turn.end > turn.start
    ]


def align_segments(conversation_id: str, segments: list[dict[str, object]],
                   turns: list[dict[str, object]]) -> tuple[list[dict[str, object]], float]:
    """Attach the dominant acoustic cluster, retaining uncertainty."""
    aligned: list[dict[str, object]] = []
    confident = 0
    for index, segment in enumerate(segments):
        start, end = int(segment["start_ms"]), int(segment["end_ms"])
        overlap: dict[str, int] = {}
        for turn in turns:
            shared = max(0, min(end, int(turn["end_ms"])) - max(start, int(turn["start_ms"])))
            if shared:
                cluster = str(turn["speaker_cluster_id"])
                overlap[cluster] = overlap.get(cluster, 0) + shared
        ranked = sorted(overlap.items(), key=lambda item: item[1], reverse=True)
        best = ranked[0] if ranked else None
        runner_up = ranked[1][1] if len(ranked) > 1 else 0
        ratio = best[1] / (end - start) if best else 0
        uncertain = end - start < 1000 or ratio < 0.5 or (best and best[1] - runner_up < 0.15 * (end - start))
        if best and not uncertain:
            confident += 1
        aligned.append({
            "id": str(uuid.uuid5(uuid.UUID(conversation_id), f"segment:{index}:{start}:{end}")),
            **segment,
            "speaker_cluster_id": best[0] if best else None,
            "speaker_uncertain": bool(uncertain),
            "speaker_coverage": round(ratio, 3),
            "provenance": "on_device_asr", "words": [],
        })
    return aligned, confident / len(aligned) if aligned else 0


def run_job(job_id: str) -> None:
    """Process source audio and save transcript; failures remain retryable."""
    job = storage.get_job(job_id)
    if not job or job["state"] == "succeeded":
        return
    conversation = storage.get_conversation(str(job["conversation_id"]))
    if not conversation:
        storage.update_job(job_id, state="failed", stage="failed", error="Recording missing", updated_at=now())
        return
    started = time.monotonic()
    whisper, segmentation, embedding = model_paths()
    try:
        if not all(path.is_file() for path in (whisper, segmentation, embedding)):
            raise RuntimeError("Speech models are not installed on this device")
        source = storage.data_dir() / "media" / str(conversation["audio_filename"])
        if not source.is_file():
            raise RuntimeError("Source audio is missing")
        with tempfile.TemporaryDirectory(prefix="stellis-speech-", dir=storage.data_dir()) as temporary:
            workspace = Path(temporary)
            wav = workspace / "audio.wav"
            _stage(job_id, "decoding", 0.02)
            _command(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(source),
                      "-ac", "1", "-ar", "16000", str(wav)], timeout=1800)
            _stage(job_id, "transcribing", 0.12)
            segments = _transcribe(wav, whisper, workspace / "transcript",
                                   json.loads(str(job["vocabulary_json"])))
            _stage(job_id, "diarizing", 0.55)
            turns = _diarize(wav, segmentation, embedding, job_id)
            _stage(job_id, "aligning", 0.96)
            aligned, coverage = align_segments(str(conversation["id"]), segments, turns)
            metrics = {
                "processing_seconds": round(time.monotonic() - started, 2),
                "segment_count": len(aligned), "turn_count": len(turns),
                "cluster_count": len({turn["speaker_cluster_id"] for turn in turns}),
                "confident_segment_fraction": round(coverage, 3),
            }
            storage.save_transcript({
                "conversation_id": conversation["id"], "revision": 1,
                "pipeline_version": job["pipeline_version"], "language": "en",
                "segments_json": json.dumps(aligned), "turns_json": json.dumps(turns),
                "updated_at": now(),
            })
            storage.update_job(job_id, state="succeeded", stage="complete", progress=1.0,
                               metrics_json=json.dumps(metrics), error=None, updated_at=now())
    except Exception as exc:
        storage.update_job(job_id, state="failed", stage="failed", error=str(exc), updated_at=now())
