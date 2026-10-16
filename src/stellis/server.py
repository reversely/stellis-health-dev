"""Loopback-only browser app and health endpoint."""

from __future__ import annotations

from importlib.metadata import version
from pathlib import Path
import json
import sqlite3

from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from stellis import ai, processing, recording, storage
from stellis.importer import ImportFailure, import_upload

app = FastAPI(title="Stellis", docs_url=None, redoc_url=None)
api = APIRouter()


class SegmentEdit(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    expected_revision: int = Field(ge=1)


class SpeakerLabelEdit(BaseModel):
    scope: str
    target_id: str
    name: str | None = Field(default=None, max_length=100)
    expected_revision: int = Field(ge=1)


class VocabularyTerm(BaseModel):
    term: str = Field(min_length=1, max_length=100)


class HighlightSelection(BaseModel):
    segment_id: str
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    expected_revision: int = Field(ge=1)


class RecordingStart(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    media_type: str


class RecordingEvent(BaseModel):
    kind: str
    media_position_ms: int = Field(ge=0)


class AIRunRequest(BaseModel):
    kind: str
    question: str | None = Field(default=None, max_length=500)


def _check_vocabulary_budget(terms: list[str]) -> None:
    if len("Vocabulary: " + ", ".join(terms)) > 400:
        raise HTTPException(status_code=400, detail="Vocabulary is too long for the local model prompt")
_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.on_event("startup")
def start_speech_worker() -> None:
    storage.fail_interrupted_ai_runs()
    processing.start_worker()


def _public(record: dict[str, object]) -> dict[str, object]:
    return {key: record[key] for key in ("id", "title", "duration_ms", "created_at")}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a small readiness response for a clean install check."""
    return {"status": "ok", "mode": "local", "version": version("stellis")}


@api.get("/health")
def versioned_health() -> dict[str, str]:
    return {**health(), "api_version": "v1"}


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the browser workspace shell."""
    return FileResponse(_STATIC / "index.html")


@app.get("/conversation/{conversation_id}", include_in_schema=False)
def conversation_page(conversation_id: str) -> FileResponse:
    """Serve the same browser workspace for a direct conversation link."""
    return FileResponse(_STATIC / "index.html")


@api.get("/conversations")
def conversations() -> list[dict[str, object]]:
    return storage.list_conversations()


@api.post("/conversations/import")
async def import_conversation(file: UploadFile = File(...)) -> dict[str, object]:
    try:
        record, duplicate = await import_upload(file)
    except ImportFailure as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"conversation": _public(record), "duplicate": duplicate}


@api.get("/recordings")
def recordings() -> list[dict[str, object]]:
    return recording.list_sessions()


@api.delete("/recordings/{recording_id}")
def discard_recording(recording_id: str) -> dict[str, bool]:
    try:
        if not recording.discard_session(recording_id):
            raise HTTPException(status_code=404, detail="Recording session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"deleted": True}


@api.post("/recordings")
def start_recording(request: RecordingStart) -> dict[str, object]:
    try:
        return recording.create_session(request.title, request.media_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not reserve local recording storage") from exc


@api.put("/recordings/{recording_id}/chunks/{sequence}")
async def store_recording_chunk(recording_id: str, sequence: int, request: Request) -> dict[str, object]:
    data = bytearray()
    async for part in request.stream():
        data.extend(part)
        if len(data) > recording.MAX_CHUNK_BYTES:
            raise HTTPException(status_code=413, detail="Recording chunk exceeds 8 MB")
    try:
        return recording.save_chunk(recording_id, sequence, bytes(data))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not store the recording chunk") from exc


@api.post("/recordings/{recording_id}/events")
def recording_event(recording_id: str, event: RecordingEvent) -> dict[str, object]:
    try:
        return recording.record_event(recording_id, event.kind, event.media_position_ms)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/recordings/{recording_id}/finalize")
async def finalize_recording(recording_id: str) -> dict[str, object]:
    try:
        result = await recording.finalize_session(recording_id)
        return {"conversation": _public(result["conversation"]), "duplicate": result["duplicate"]}
    except (ValueError, ImportFailure) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not finalize the local recording") from exc


@api.get("/conversations/{conversation_id}")
def conversation(conversation_id: str) -> dict[str, object]:
    record = storage.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _public(record)


@api.get("/conversations/{conversation_id}/audio")
def conversation_audio(conversation_id: str) -> FileResponse:
    record = storage.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    path = storage.data_dir() / "media" / str(record["audio_filename"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type=str(record["audio_media_type"]), headers={"Cache-Control": "no-store"})


@api.get("/capabilities")
def capabilities() -> dict[str, object]:
    return {**processing.capabilities(), "ai": ai.capabilities()}


@api.get("/conversations/{conversation_id}/ai-runs")
def ai_runs(conversation_id: str) -> list[dict[str, object]]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [ai.public_run(item) for item in storage.list_ai_runs(conversation_id)]


@api.post("/conversations/{conversation_id}/ai-runs")
def start_ai_run(conversation_id: str, request: AIRunRequest) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        return ai.public_run(ai.request_run(conversation_id, request.kind, request.question))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@api.get("/ai-runs/{run_id}")
def ai_run(run_id: str) -> dict[str, object]:
    record = storage.get_ai_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="AI run not found")
    return ai.public_run(record)


@api.get("/conversations/{conversation_id}/processing-job")
def conversation_job(conversation_id: str) -> dict[str, object] | None:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    job = storage.get_latest_job_for_conversation(conversation_id)
    return processing.public_job(job) if job else None


@api.post("/conversations/{conversation_id}/processing-jobs")
def process_conversation(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ready = processing.capabilities()["features"]
    if not ready["transcribe"] or not ready["diarize"]:
        raise HTTPException(status_code=409, detail="Install the local speech models before processing")
    return processing.public_job(processing.request_processing(conversation_id))


@api.get("/jobs/{job_id}")
def job(job_id: str) -> dict[str, object]:
    record = storage.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return processing.public_job(record)


@api.get("/conversations/{conversation_id}/transcript")
def transcript(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = storage.get_display_transcript(conversation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Transcript is not ready")
    return result


@api.post("/conversations/{conversation_id}/highlights")
def add_highlight(conversation_id: str, selection: HighlightSelection) -> dict[str, object]:
    try:
        return storage.add_highlight(conversation_id, selection.segment_id,
                                     selection.start_offset, selection.end_offset,
                                     selection.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.delete("/conversations/{conversation_id}/highlights/{highlight_id}")
def delete_highlight(conversation_id: str, highlight_id: str) -> dict[str, bool]:
    if not storage.delete_highlight(conversation_id, highlight_id):
        raise HTTPException(status_code=404, detail="Highlight not found")
    return {"deleted": True}


@api.get("/conversations/{conversation_id}/transcript/generations")
def transcript_generations(conversation_id: str) -> list[dict[str, object]]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return storage.list_transcript_generations(conversation_id)


@api.get("/conversations/{conversation_id}/transcript/generations/{version}")
def transcript_generation(conversation_id: str, version: str) -> dict[str, object]:
    record = storage.get_transcript_generation(conversation_id, version)
    if record is None:
        raise HTTPException(status_code=404, detail="Transcript generation not found")
    return {
        "conversation_id": conversation_id, "pipeline_version": version,
        "revision": record["revision"], "language": record["language"],
        "segments": json.loads(str(record["segments_json"])),
        "turns": json.loads(str(record["turns_json"])),
        "created_at": record["created_at"],
    }


@api.patch("/conversations/{conversation_id}/transcript/segments/{segment_id}")
def edit_segment(conversation_id: str, segment_id: str, edit: SegmentEdit) -> dict[str, int]:
    cleaned = edit.text.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty")
    try:
        revision = storage.edit_transcript_segment(conversation_id, segment_id, cleaned, edit.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"revision": revision}


@api.put("/conversations/{conversation_id}/speakers/label")
def label_speaker(conversation_id: str, edit: SpeakerLabelEdit) -> dict[str, int]:
    cleaned = edit.name.strip() if edit.name is not None else None
    if cleaned == "":
        cleaned = None
    try:
        revision = storage.set_speaker_label(conversation_id, edit.scope, edit.target_id,
                                             cleaned, edit.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"revision": revision}


@api.get("/vocabulary")
def vocabulary() -> list[dict[str, object]]:
    return storage.list_vocabulary()


@api.post("/vocabulary")
def add_vocabulary(term: VocabularyTerm) -> dict[str, object]:
    cleaned = term.term.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Vocabulary term cannot be empty")
    _check_vocabulary_budget([*[str(item["term"]) for item in storage.list_vocabulary()], cleaned])
    try:
        return storage.add_vocabulary(cleaned)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Vocabulary term already exists") from exc


@api.patch("/vocabulary/{term_id}")
def update_vocabulary(term_id: str, term: VocabularyTerm) -> dict[str, object]:
    cleaned = term.term.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Vocabulary term cannot be empty")
    current = storage.list_vocabulary()
    if not any(item["id"] == term_id for item in current):
        raise HTTPException(status_code=404, detail="Vocabulary term not found")
    _check_vocabulary_budget([cleaned if item["id"] == term_id else str(item["term"]) for item in current])
    try:
        result = storage.update_vocabulary(term_id, cleaned)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Vocabulary term already exists") from exc
    if result is None:
        raise HTTPException(status_code=404, detail="Vocabulary term not found")
    return result


@api.delete("/vocabulary/{term_id}")
def delete_vocabulary(term_id: str) -> dict[str, bool]:
    if not storage.delete_vocabulary(term_id):
        raise HTTPException(status_code=404, detail="Vocabulary term not found")
    return {"deleted": True}


app.include_router(api, prefix="/api/v1")
app.include_router(api, prefix="/api", include_in_schema=False)
