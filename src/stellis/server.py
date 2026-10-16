"""Loopback-only browser app and health endpoint."""

from __future__ import annotations

from importlib.metadata import version
from pathlib import Path
import json
import logging
import sqlite3
import threading

from fastapi import APIRouter, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from stellis import ai, clean, generation_review, library, people, processing, recording, search, storage
from stellis.importer import ImportFailure, import_upload

app = FastAPI(title="Stellis", docs_url=None, redoc_url=None)
api = APIRouter()
_retention_stop = threading.Event()
_retention_thread: threading.Thread | None = None


def _retention_loop() -> None:
    while not _retention_stop.is_set():
        try:
            result = library.delete_expired()
            if result["deleted"] or result["deferred"]:
                logging.getLogger(__name__).info("Recently Deleted retention sweep: %s", result)
        except Exception:
            logging.getLogger(__name__).exception("Recently Deleted retention sweep failed")
        if _retention_stop.wait(3600):
            break


class SegmentEdit(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    expected_revision: int = Field(ge=1)


class SegmentChange(BaseModel):
    segment_id: str
    text: str = Field(min_length=1, max_length=4000)


class TranscriptBatchEdit(BaseModel):
    edits: list[SegmentChange] = Field(min_length=1, max_length=500)
    expected_revision: int = Field(ge=1)


class SpeakerLabelEdit(BaseModel):
    scope: str
    target_id: str
    name: str | None = Field(default=None, max_length=100)
    expected_revision: int = Field(ge=1)


class VocabularyTerm(BaseModel):
    term: str = Field(min_length=1, max_length=100)


class CategoryName(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class PersonName(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class PersonLink(BaseModel):
    person_id: str
    segment_id: str
    scope: str
    expected_revision: int = Field(ge=1)


class PersonUnlink(BaseModel):
    segment_id: str
    scope: str
    expected_revision: int = Field(ge=1)


class PersonMerge(BaseModel):
    source_id: str


class PersonMove(BaseModel):
    conversation_id: str
    target_id: str


class GenerationReviewDecision(BaseModel):
    item_id: str
    target_segment_id: str | None = None


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


class CleanSegmentEdit(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    expected_revision: int = Field(ge=0)


class CleanBatchEdit(BaseModel):
    edits: list[SegmentChange] = Field(min_length=1, max_length=500)
    expected_revision: int = Field(ge=0)


class CleanReview(BaseModel):
    expected_revision: int = Field(ge=0)


class WordAlignmentRequest(BaseModel):
    source_generation_version: str | None = None


def _check_vocabulary_budget(terms: list[str]) -> None:
    if len("Vocabulary: " + ", ".join(terms)) > 400:
        raise HTTPException(status_code=400, detail="Vocabulary is too long for the local model prompt")
_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.on_event("startup")
def start_speech_worker() -> None:
    global _retention_thread
    library.recover_staged_media()
    storage.fail_interrupted_ai_runs()
    storage.fail_interrupted_clean_runs()
    processing.start_worker()
    if _retention_thread is None or not _retention_thread.is_alive():
        _retention_stop.clear()
        _retention_thread = threading.Thread(target=_retention_loop, name="stellis-retention", daemon=True)
        _retention_thread.start()


@app.on_event("shutdown")
def stop_retention_worker() -> None:
    _retention_stop.set()


def _public(record: dict[str, object]) -> dict[str, object]:
    return {key: record[key] for key in ("id", "title", "duration_ms", "created_at")} | {
        "category_ids": library.assignments(str(record["id"])).get(str(record["id"]), [])}


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


@app.get("/person/{person_id}", include_in_schema=False)
def person_page(person_id: str) -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@api.get("/conversations")
def conversations() -> list[dict[str, object]]:
    assigned = library.assignments()
    return [{**item, "category_ids": assigned.get(str(item["id"]), [])}
            for item in storage.list_conversations()]


@api.get("/categories")
def categories() -> list[dict[str, object]]:
    return library.categories()


@api.get("/persons")
def persons() -> list[dict[str, object]]:
    return people.list_people()


@api.post("/persons")
def create_person(request: PersonName) -> dict[str, object]:
    try:
        return people.create_person(request.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.get("/persons/{person_id}")
def person_profile(person_id: str) -> dict[str, object]:
    result = people.get_person(person_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return result


@api.patch("/persons/{person_id}")
def rename_person(person_id: str, request: PersonName) -> dict[str, object]:
    try:
        return people.rename_person(person_id, request.name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.delete("/persons/{person_id}")
def delete_person(person_id: str) -> dict[str, object]:
    try:
        return people.delete_person(person_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/persons/{person_id}/merge")
def merge_people(person_id: str, request: PersonMerge) -> dict[str, object]:
    try:
        return people.merge_people(person_id, request.source_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.post("/persons/{person_id}/move-conversation")
def move_person_conversation(person_id: str, request: PersonMove) -> dict[str, object]:
    try:
        return people.move_conversation_links(person_id, request.conversation_id, request.target_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.delete("/persons/{person_id}/conversations/{conversation_id}")
def remove_person_conversation(person_id: str, conversation_id: str) -> dict[str, object]:
    try:
        return people.remove_conversation_links(person_id, conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.put("/conversations/{conversation_id}/person-links")
def confirm_person(conversation_id: str, request: PersonLink) -> dict[str, object]:
    try:
        return people.confirm_person(conversation_id, request.segment_id, request.person_id,
                                     request.scope, request.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/person-links/remove")
def remove_person(conversation_id: str, request: PersonUnlink) -> dict[str, object]:
    try:
        return people.remove_person(conversation_id, request.segment_id, request.scope,
                                    request.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/categories")
def create_category(request: CategoryName) -> dict[str, object]:
    try:
        return library.create_category(request.name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.patch("/categories/{category_id}")
def rename_category(category_id: str, request: CategoryName) -> dict[str, object]:
    try:
        return library.rename_category(category_id, request.name)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.delete("/categories/{category_id}")
def delete_category(category_id: str) -> dict[str, bool]:
    if not library.delete_category(category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"deleted": True}


@api.put("/conversations/{conversation_id}/categories/{category_id}")
def assign_category(conversation_id: str, category_id: str) -> dict[str, object]:
    try:
        return {"category_ids": library.set_category(conversation_id, category_id, True)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.delete("/conversations/{conversation_id}/categories/{category_id}")
def remove_category(conversation_id: str, category_id: str) -> dict[str, object]:
    try:
        return {"category_ids": library.set_category(conversation_id, category_id, False)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.get("/trash")
def trash() -> list[dict[str, object]]:
    assigned = library.assignments()
    return [{**item, "category_ids": assigned.get(str(item["id"]), []),
             "expires_at": library.expires_at(str(item["trashed_at"]))}
            for item in storage.list_conversations(trashed=True)]


@api.post("/conversations/{conversation_id}/trash")
def move_to_trash(conversation_id: str) -> dict[str, object]:
    try:
        return library.move_to_trash(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/trash/{conversation_id}/restore")
def restore_from_trash(conversation_id: str) -> dict[str, object]:
    try:
        return library.restore(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.delete("/trash/{conversation_id}")
def delete_from_trash(conversation_id: str) -> dict[str, object]:
    try:
        return library.delete_permanently(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.get("/search")
def library_search(q: str = Query(min_length=2, max_length=120), category_id: str | None = None) -> dict[str, object]:
    try:
        return search.search_library(q, category_id=category_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    try:
        return processing.public_job(processing.request_processing(conversation_id))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/speaker-rematch")
def rematch_speakers(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not processing.model_paths()[2].is_file():
        raise HTTPException(status_code=409, detail="Install the local speaker embedding model")
    try:
        return processing.public_job(processing.request_rematch(conversation_id))
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/word-alignment")
def align_conversation_words(conversation_id: str, request: WordAlignmentRequest | None = None) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        return processing.public_job(processing.request_word_alignment(
            conversation_id, request.source_generation_version if request else None))
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.get("/jobs/{job_id}")
def job(job_id: str) -> dict[str, object]:
    record = storage.get_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return processing.public_job(record)


@api.get("/conversations/{conversation_id}/transcript/review")
def transcript_review(conversation_id: str) -> dict[str, object] | None:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return generation_review.get_review(conversation_id)


@api.get("/conversations/{conversation_id}/transcript/review/history")
def transcript_review_history(conversation_id: str) -> list[dict[str, object]]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return generation_review.list_history(conversation_id)


@api.put("/conversations/{conversation_id}/transcript/review/decisions")
def decide_transcript_review(conversation_id: str, request: GenerationReviewDecision) -> dict[str, object]:
    try:
        return generation_review.decide(conversation_id, request.item_id, request.target_segment_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/transcript/review/activate")
def activate_transcript_review(conversation_id: str) -> dict[str, object]:
    try:
        return generation_review.activate(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/transcript/review/keep-source")
def keep_review_source(conversation_id: str) -> dict[str, object]:
    try:
        return generation_review.keep_source(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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


@api.patch("/conversations/{conversation_id}/transcript/segments")
def edit_segments(conversation_id: str, request: TranscriptBatchEdit) -> dict[str, int]:
    edits = [{"segment_id": item.segment_id, "text": item.text.strip()} for item in request.edits]
    if any(not item["text"] for item in edits):
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty")
    try:
        revision = storage.edit_transcript_segments(conversation_id, edits, request.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"revision": revision}


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


@api.get("/conversations/{conversation_id}/clean-runs")
def clean_runs(conversation_id: str) -> list[dict[str, object]]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [clean.public_run(item) for item in storage.list_clean_runs(conversation_id)]


@api.post("/conversations/{conversation_id}/clean-runs")
def start_clean_run(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        return clean.public_run(clean.request_run(conversation_id))
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(status_code=503 if exc.code == "not_configured" else 400, detail=str(exc)) from exc


@api.get("/clean-runs/{run_id}")
def clean_run(run_id: str) -> dict[str, object]:
    record = storage.get_clean_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Edited transcript not found")
    return clean.public_run(record)


@api.patch("/clean-runs/{run_id}/segments")
def edit_clean_segments(run_id: str, edit: CleanBatchEdit) -> dict[str, int]:
    edits = [{"segment_id": item.segment_id, "text": item.text.strip()} for item in edit.edits]
    if any(not item["text"] for item in edits):
        raise HTTPException(status_code=400, detail="Enter transcript words")
    try:
        revision = storage.set_clean_run_edits(run_id, edits, edit.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"edit_revision": revision}


@api.put("/clean-runs/{run_id}/segments/{segment_id}/review")
def review_clean_segment(run_id: str, segment_id: str, review: CleanReview) -> dict[str, int]:
    try:
        revision = storage.set_clean_run_review(run_id, segment_id, review.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"edit_revision": revision}


@api.patch("/clean-runs/{run_id}/segments/{segment_id}")
def edit_clean_segment(run_id: str, segment_id: str, edit: CleanSegmentEdit) -> dict[str, object]:
    value = edit.text.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Enter transcript words")
    try:
        revision = storage.set_clean_run_edit(run_id, segment_id, value, edit.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"edit_revision": revision}


app.include_router(api, prefix="/api/v1")
app.include_router(api, prefix="/api", include_in_schema=False)
