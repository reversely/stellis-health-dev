"""Loopback-only browser app and health endpoint."""

from __future__ import annotations

from importlib.metadata import version
from pathlib import Path

from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from stellis import storage
from stellis.importer import ImportFailure, import_upload

app = FastAPI(title="Stellis", docs_url=None, redoc_url=None)
api = APIRouter()
_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


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


app.include_router(api, prefix="/api/v1")
app.include_router(api, prefix="/api", include_in_schema=False)
