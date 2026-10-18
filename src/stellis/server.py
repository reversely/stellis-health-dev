"""Loopback-only browser app and health endpoint."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from importlib.metadata import version
from pathlib import Path
import asyncio
import json
import logging
import os
import sqlite3
import subprocess
import threading
from typing import Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from stellis import ai, auth, calendar, categorization, clean, collections, enhanced_notes, generation_review, images, library, linkpreview, notebooks, notes, pages, people, processing, recording, recording_ai, recording_preview, search, storage, suggestions, todos
from stellis.importer import ImportFailure, import_upload

app = FastAPI(title="Stellis", docs_url=None, redoc_url=None)
api = APIRouter()
_retention_stop = threading.Event()
_retention_thread: threading.Thread | None = None


@app.middleware("http")
async def session_gate(request: Request, call_next):
    """Gate all workspace and API routes in explicit local login mode."""
    if not auth.enabled():
        return await call_next(request)
    path = request.url.path
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
            return JSONResponse({"detail": "Origin rejected"}, status_code=403)
    if (path.startswith("/static/") or path in {"/auth", "/api/health", "/api/v1/health"}
            or path.startswith("/api/v1/auth/")
            or (request.method == "GET" and path in {
                "/api/v1/calendar/google/callback", "/api/v1/calendar/microsoft/callback"})):
        return await call_next(request)
    if auth.current_account(request.cookies.get(auth.COOKIE_NAME)) is None:
        if path.startswith("/api/"):
            return JSONResponse({"detail": "Login required"}, status_code=401)
        return RedirectResponse("/auth", status_code=303)
    return await call_next(request)


@app.middleware("http")
async def development_cache_policy(request: Request, call_next):
    """Revalidate mutable assets so a normal reload uses the current local build."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith(("/static/", "/shared/")):
        response.headers["Cache-Control"] = "private, no-cache"
    elif path.startswith(("/api/v1/calendar/", "/api/calendar/")):
        response.headers["Cache-Control"] = "no-store"
    elif (path in {"/", "/auth", "/recording", "/vocabulary", "/settings"} or
          path.startswith(("/conversation/", "/person/", "/vocabulary/", "/notebook/"))):
        response.headers["Cache-Control"] = "no-store"
    return response


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=12, max_length=1024)


class LoginCredentials(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)


def _session_response(token: str, username: str) -> JSONResponse:
    response = JSONResponse({"username": username})
    response.set_cookie(auth.COOKIE_NAME, token, max_age=auth.SESSION_DAYS * 86400,
                        httponly=True, samesite="strict", secure=False, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/auth", include_in_schema=False)
def auth_page() -> FileResponse:
    return FileResponse(_STATIC / "auth.html")


@app.get("/api/v1/auth/status")
def auth_status(request: Request) -> dict[str, object]:
    return {"required": auth.enabled(), "registration_open": auth.enabled() and not auth.has_account(),
            "username": auth.current_account(request.cookies.get(auth.COOKIE_NAME)) if auth.enabled() else None}


@app.post("/api/v1/auth/register")
def auth_register(credentials: Credentials) -> JSONResponse:
    if not auth.enabled():
        raise HTTPException(status_code=404, detail="Login is disabled")
    try:
        username = auth.register(credentials.username, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _session_response(auth.create_session(), username)


@app.post("/api/v1/auth/login")
def auth_login(credentials: LoginCredentials) -> JSONResponse:
    if not auth.enabled():
        raise HTTPException(status_code=404, detail="Login is disabled")
    token = auth.login(credentials.username, credentials.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _session_response(token, credentials.username)


class ProfileUpdate(BaseModel):
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)


class UsernameChange(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=1024)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)


class AccountDeletion(BaseModel):
    password: str = Field(min_length=1, max_length=1024)
    confirm: str


def _account_request(request: Request) -> str | None:
    """Return the session token for account changes, refusing open mode and the shared dev login."""
    if not auth.enabled():
        raise HTTPException(status_code=404, detail="Login is disabled")
    token = request.cookies.get(auth.COOKIE_NAME)
    if auth.dev_enabled() and auth.current_account(token) == "dev":
        raise HTTPException(status_code=403, detail="The dev login has no account settings")
    return token


def _account_errors(action):
    try:
        return action()
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="That username is taken") from exc


@app.get("/api/v1/account")
def account_profile(request: Request) -> dict[str, str]:
    _account_request(request)
    return _account_errors(auth.profile)


@app.patch("/api/v1/account")
def account_update(request: Request, update: ProfileUpdate) -> dict[str, str]:
    _account_request(request)
    return _account_errors(lambda: auth.update_profile(update.name, update.email))


@app.post("/api/v1/account/username")
def account_username(request: Request, change: UsernameChange) -> dict[str, str]:
    _account_request(request)
    return _account_errors(lambda: auth.change_username(change.username, change.password))


@app.post("/api/v1/account/password")
def account_password(request: Request, change: PasswordChange) -> dict[str, bool]:
    token = _account_request(request)
    _account_errors(lambda: auth.change_password(change.current_password, change.new_password, token))
    return {"changed": True}


@app.delete("/api/v1/account")
def account_delete(request: Request, deletion: AccountDeletion) -> JSONResponse:
    _account_request(request)
    if deletion.confirm != "DELETE":
        raise HTTPException(status_code=400, detail="Type DELETE to confirm")
    _account_errors(lambda: auth.verify_password(deletion.password))
    try:
        erased = library.erase_all()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    for provider in calendar.PROVIDERS:
        calendar.disconnect(provider)
    auth.delete_account()
    response = JSONResponse({"deleted": True, **erased})
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/v1/auth/logout")
def auth_logout(request: Request) -> JSONResponse:
    auth.revoke(request.cookies.get(auth.COOKIE_NAME))
    response = JSONResponse({"logged_out": True})
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


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


class VocabularyCreate(VocabularyTerm):
    kind: Literal["name", "other"] = "other"


class VocabularyBatch(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=200)
    kind: Literal["name", "other"] = "other"


class VocabularySelection(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)


class VocabularyMove(VocabularySelection):
    kind: Literal["name", "other"]


class CategoryName(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class CategoryAutomationSetting(BaseModel):
    enabled: bool


class PersonName(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class PersonVisibility(BaseModel):
    hidden: bool


class PersonLink(BaseModel):
    person_id: str | None = None
    name: str | None = Field(default=None, max_length=100)
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


class HighlightSelection(BaseModel):
    segment_id: str
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    expected_revision: int = Field(ge=1)


class CommentSelection(HighlightSelection):
    body: str = Field(min_length=1, max_length=2000)


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class RecordingStart(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    media_type: str
    notebook_id: str | None = None
    calendar_provider: str | None = None
    calendar_event_id: str | None = Field(default=None, max_length=1024)


class RecordingRename(BaseModel):
    title: str = Field(min_length=1, max_length=180)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=180)


class RecordingEvent(BaseModel):
    kind: str
    media_position_ms: int = Field(ge=0)


class TodoDue(BaseModel):
    due_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class NotesWrite(BaseModel):
    markdown: str = Field(max_length=200_000)
    expected_revision: int = Field(ge=0)
    todo_dates: dict[str, TodoDue | None] | None = None


class TodoStatus(BaseModel):
    status: Literal["open", "done", "canceled"]


class PageCreate(BaseModel):
    title: str | None = None
    notebook_id: str | None = None
    markdown: str = ""


class PageRename(BaseModel):
    title: str | None = None


class PageWrite(BaseModel):
    markdown: str
    expected_revision: int = Field(ge=0)
    todo_dates: dict[str, TodoDue | None] | None = None


class ImageCaption(BaseModel):
    caption: str = Field(max_length=280)


class EnhancedNotesRequest(BaseModel):
    force: bool = False


class RecordingQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class AIRunRequest(BaseModel):
    kind: str
    question: str | None = Field(default=None, max_length=500)
    force: bool = False


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


_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_STATIC), name="static")
app.mount("/shared", StaticFiles(directory=Path(__file__).parent / "shared"), name="shared")


@app.on_event("startup")
def start_speech_worker() -> None:
    global _retention_thread
    library.recover_staged_media()
    images.recover_orphans()
    storage.fail_interrupted_ai_runs()
    storage.fail_interrupted_clean_runs()
    categorization.fail_interrupted()
    enhanced_notes.fail_interrupted()
    recording_ai.fail_interrupted()
    generation_review.resolve_pending()
    processing.start_worker()
    processing.index_missing_voices()
    if _retention_thread is None or not _retention_thread.is_alive():
        _retention_stop.clear()
        _retention_thread = threading.Thread(target=_retention_loop, name="stellis-retention", daemon=True)
        _retention_thread.start()


@app.on_event("shutdown")
def stop_retention_worker() -> None:
    _retention_stop.set()
    processing.stop_worker()


def _public(record: dict[str, object]) -> dict[str, object]:
    return {key: record.get(key) for key in ("id", "title", "duration_ms", "created_at", "recorded_at", "notebook_id")} | {
        "category_ids": library.assignments(str(record["id"])).get(str(record["id"]), [])}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a small readiness response for a clean install check."""
    return {"status": "ok", "mode": "local", "version": version("stellis")}


@api.get("/health")
def versioned_health() -> dict[str, str]:
    return {**health(), "api_version": "v1"}


@api.get("/sync-config")
def sync_config() -> dict[str, str | None]:
    value = os.environ.get("STELLIS_SYNC_ORIGIN", "").strip()
    if not value:
        return {"origin": None}
    parsed = urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost"}
            or parsed.port is None or parsed.path or parsed.query or parsed.fragment
            or parsed.username is not None or parsed.password is not None):
        raise HTTPException(status_code=500, detail="Invalid sync origin configuration")
    return {"origin": value}


@api.get("/calendar/connections")
def calendar_connections() -> list[dict[str, object]]:
    return calendar.connections()


@api.get("/calendar/{provider}/authorize")
def calendar_authorize(provider: str, request: Request,
                       return_to: Literal["/", "/settings"] = "/") -> dict[str, str]:
    if request.url.hostname not in {"127.0.0.1", "localhost"} or request.url.port is None:
        raise HTTPException(status_code=400, detail="Open Stellis on its local address to connect a calendar")
    try:
        return {"url": calendar.authorize(provider, request.url.port, str(request.base_url).rstrip("/") + return_to)}
    except calendar.CalendarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.get("/calendar/{provider}/callback", include_in_schema=False)
async def calendar_callback(provider: str, state: str = "", code: str = "", error: str = "") -> RedirectResponse:
    return_origin = ""
    try:
        verifier, uri, return_origin = calendar.consume_state(provider, state)
        if error or not code:
            raise calendar.CalendarError("Calendar connection was cancelled")
        await calendar.exchange(provider, code, verifier, uri)
        result = "connected"
    except calendar.CalendarError:
        result = "failed"
    # return_origin carries the page that started the connection, home or Settings.
    response = RedirectResponse(f"{return_origin or '/'}?calendar={result}", status_code=303)
    response.headers["Cache-Control"] = "no-store"
    return response


@api.post("/calendar/{provider}/disconnect")
def calendar_disconnect(provider: str) -> dict[str, bool]:
    try:
        calendar.disconnect(provider)
    except calendar.CalendarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"disconnected": True}


@api.get("/calendar/meetings")
async def calendar_meetings() -> dict[str, object]:
    connected = [row["provider"] for row in calendar.connections() if row["connected"]]
    results = await asyncio.gather(*(calendar.events(provider) for provider in connected), return_exceptions=True)
    meetings: list[dict] = []
    errors: list[dict] = []
    for provider, result in zip(connected, results):
        if isinstance(result, Exception):
            errors.append({"provider": provider, "message": str(result) if isinstance(result, calendar.CalendarError)
                           else "Could not load meetings. Try Refresh."})
        else:
            meetings.extend(result)
    meetings.sort(key=lambda event: event["start"])
    noted = notes.events_with_notes()
    for event in meetings:
        event["has_notes"] = (event["provider"], event["id"]) in noted
    return {"meetings": meetings[:100], "errors": errors}


class EventNotesSave(BaseModel):
    provider: str
    event_id: str = Field(min_length=1, max_length=1024)
    markdown: str
    expected_revision: int = Field(ge=0)


@api.get("/calendar/notes")
def calendar_event_notes(provider: str, event_id: str) -> dict[str, object]:
    try:
        return notes.get_event(provider, event_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.put("/calendar/notes")
def save_calendar_event_notes(request: EventNotesSave) -> dict[str, object]:
    try:
        return notes.save_event(request.provider, request.event_id, request.markdown, request.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the browser workspace shell."""
    return FileResponse(_STATIC / "index.html")


@app.get("/conversation/{conversation_id}", include_in_schema=False)
def conversation_page(conversation_id: str) -> FileResponse:
    """Serve the same browser workspace for a direct conversation link."""
    return FileResponse(_STATIC / "index.html")


@app.get("/recording", include_in_schema=False)
def recording_page() -> FileResponse:
    """Serve the recording workspace on reload."""
    return FileResponse(_STATIC / "index.html")


@app.get("/person/{person_id}", include_in_schema=False)
def person_page(person_id: str) -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/settings", include_in_schema=False)
@app.get("/notebook/{notebook_id}", include_in_schema=False)
def settings_or_notebook_page(notebook_id: str | None = None) -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/vocabulary", include_in_schema=False)
@app.get("/vocabulary/{section}", include_in_schema=False)
def vocabulary_page(section: str | None = None) -> FileResponse:
    if section not in {None, "names", "other"}:
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(_STATIC / "index.html")


@api.get("/conversations")
def conversations() -> list[dict[str, object]]:
    assigned = library.assignments()
    items = storage.list_conversations()
    lines = notebooks.summary_points([str(item["id"]) for item in items])
    return [{**item, "category_ids": assigned.get(str(item["id"]), []),
             "summary_line": lines.get(str(item["id"]), {}).get("summary_line"),
             "topic_line": lines.get(str(item["id"]), {}).get("topic_line"),
             **_processing_state(str(item["id"]))} for item in items]


def _processing_state(conversation_id: str) -> dict[str, object]:
    """Let the library show work started anywhere: queued, running, or stopped."""
    job = storage.get_latest_job_for_conversation(conversation_id)
    return {"processing_job": processing.public_job(job) if job and job["state"] != "succeeded" else None}


class NotebookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = None


class NotebookUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = None
    todo_list: Literal["inherit", "on", "off"] | None = None


class NotebookAssignment(BaseModel):
    notebook_id: str | None = None


class LinkPreviewRequest(BaseModel):
    url: str = Field(max_length=2048)


@api.post("/link-previews")
async def link_preview(request: LinkPreviewRequest) -> dict[str, str | None]:
    try:
        return await linkpreview.preview(request.url)
    except linkpreview.AddressRefused as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api.get("/notebooks")
def list_notebooks() -> dict[str, object]:
    return {"palette": list(notebooks.PALETTE), "notebooks": notebooks.list_notebooks()}


@api.post("/notebooks")
def create_notebook(request: NotebookCreate) -> dict[str, object]:
    try:
        return notebooks.create(request.name, request.color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.patch("/notebooks/{notebook_id}")
def update_notebook(notebook_id: str, request: NotebookUpdate) -> dict[str, object]:
    try:
        return notebooks.update(notebook_id, name=request.name, color=request.color, todo_list=request.todo_list)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.delete("/notebooks/{notebook_id}")
def delete_notebook(notebook_id: str) -> dict[str, bool]:
    if not notebooks.delete(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"deleted": True}


@api.put("/conversations/{conversation_id}/notebook")
def assign_notebook(conversation_id: str, request: NotebookAssignment) -> dict[str, object]:
    try:
        return notebooks.assign(conversation_id, request.notebook_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = None


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = None
    todo_list: Literal["on", "off"] | None = None


class CollectionAssignment(BaseModel):
    collection_id: str | None = None


def _collection_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=409 if isinstance(exc, collections.NameTaken) else 400, detail=str(exc))


@api.get("/collections")
def list_collections() -> dict[str, object]:
    return {"palette": list(notebooks.PALETTE), "collections": collections.list_collections()}


@api.post("/collections", status_code=201)
def create_collection(request: CollectionCreate) -> dict[str, object]:
    try:
        return collections.create(request.name, request.color)
    except ValueError as exc:
        raise _collection_error(exc) from exc


@api.patch("/collections/{collection_id}")
def update_collection(collection_id: str, request: CollectionUpdate) -> dict[str, object]:
    try:
        return collections.update(collection_id, name=request.name, color=request.color, todo_list=request.todo_list)
    except (LookupError, ValueError) as exc:
        raise _collection_error(exc) from exc


@api.delete("/collections/{collection_id}")
def delete_collection(collection_id: str) -> dict[str, bool]:
    if not collections.delete(collection_id):
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"deleted": True}


@api.put("/notebooks/{notebook_id}/collection")
def assign_notebook_collection(notebook_id: str, request: CollectionAssignment) -> dict[str, object]:
    try:
        return collections.assign_notebook(notebook_id, request.collection_id)
    except LookupError as exc:
        raise _collection_error(exc) from exc


def _recorded_at(value: str | None) -> str | None:
    """Accept a browser-reported capture time only when it is a plausible past instant."""
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(value)
    except ValueError:
        return None
    if stamp.tzinfo is None:
        return None
    now = datetime.now(timezone.utc)
    if not datetime(1990, 1, 1, tzinfo=timezone.utc) <= stamp <= now + timedelta(minutes=5):
        return None
    return stamp.astimezone(timezone.utc).isoformat()


@api.get("/categories")
def categories() -> list[dict[str, object]]:
    return library.categories()


class NebiusKey(BaseModel):
    key: str = Field(min_length=1, max_length=512)


@api.get("/settings/nebius-key")
def nebius_key_status() -> dict[str, object]:
    return ai.key_status()


@api.put("/settings/nebius-key")
def save_nebius_key(request: NebiusKey) -> dict[str, object]:
    try:
        return ai.save_key(request.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.delete("/settings/nebius-key")
def remove_nebius_key() -> dict[str, object]:
    return ai.remove_key()


@api.get("/samples")
def sample_status() -> dict[str, object]:
    from stellis import samples
    return samples.status()


@api.post("/samples")
def add_samples() -> dict[str, object]:
    from stellis import samples
    return samples.start()


@api.get("/setup")
def setup_status() -> dict[str, object]:
    from stellis import models
    return {**models.status(), "missing": models.missing()}


@api.get("/category-groups")
def category_groups() -> list[dict[str, object]]:
    return notebooks.category_groups()


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


@api.patch("/persons/{person_id}/visibility")
def set_person_visibility(person_id: str, request: PersonVisibility) -> dict[str, object]:
    try:
        return people.set_person_hidden(person_id, request.hidden)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
                                     request.scope, request.expected_revision, name=request.name)
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


@api.get("/categories/automation")
def category_automation_settings() -> dict[str, object]:
    return categorization.settings()


@api.put("/categories/automation")
def set_category_automation(request: CategoryAutomationSetting) -> dict[str, object]:
    return categorization.set_enabled(request.enabled)


@api.get("/conversations/{conversation_id}/categorization")
def categorization_status(conversation_id: str) -> dict[str, object]:
    try:
        return categorization.status(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/categorization")
def retry_categorization(conversation_id: str) -> dict[str, object]:
    try:
        return categorization.request(conversation_id, retry=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
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
             "expires_at": library.expires_at(str(item["trashed_at"])), "kind": "conversation"}
            for item in storage.list_conversations(trashed=True)] + [
        {**item, "expires_at": library.expires_at(str(item["trashed_at"])), "kind": "page"}
        for item in pages.trashed()]


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
        try:
            return pages.restore(conversation_id)
        except LookupError:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.delete("/trash/{conversation_id}")
def delete_from_trash(conversation_id: str) -> dict[str, object]:
    try:
        return library.delete_permanently(conversation_id)
    except LookupError as exc:
        try:
            return pages.delete_permanently(conversation_id)
        except LookupError:
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
async def import_conversation(file: UploadFile = File(...), recorded_at: str | None = Form(None),
                              notebook_id: str | None = Form(None)) -> dict[str, object]:
    if notebook_id and not notebooks.exists(notebook_id):
        raise HTTPException(status_code=404, detail="Notebook not found")
    try:
        record, duplicate = await import_upload(file, recorded_at=_recorded_at(recorded_at), notebook_id=notebook_id or None)
    except ImportFailure as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    job = storage.get_latest_job_for_conversation(str(record["id"]))
    if storage.get_transcript(str(record["id"])) is None:
        ready = processing.capabilities()["features"]
        if ready["transcribe"] and ready["diarize"]:
            job = processing.request_processing(str(record["id"]))
    else:
        try:
            enhanced_notes.request(str(record["id"]))
        except (LookupError, ValueError, ai.AIError):
            pass
    return {
        "conversation": _public(record),
        "duplicate": duplicate,
        "processing_job": processing.public_job(job) if job else None,
    }


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
        if request.notebook_id and not notebooks.exists(request.notebook_id):
            raise ValueError("Notebook not found")
        event = (request.calendar_provider, request.calendar_event_id) if request.calendar_provider and request.calendar_event_id else None
        return recording.create_session(request.title, request.media_type, request.notebook_id, event)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not reserve local recording storage") from exc


@api.patch("/recordings/{recording_id}")
def rename_recording(recording_id: str, request: RecordingRename) -> dict[str, object]:
    try:
        return recording.rename_session(recording_id, request.title)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
        conversation_id = str(result["conversation"]["id"])
        if storage.get_transcript(conversation_id) is None:
            ready = processing.capabilities()["features"]
            if ready["transcribe"] and ready["diarize"]:
                try:
                    processing.request_processing(conversation_id)
                except RuntimeError:
                    pass  # Finalization succeeded; a pending review can block another speech job.
        else:
            try:
                enhanced_notes.request(conversation_id)
            except (LookupError, ValueError, ai.AIError):
                pass
        return {"conversation": _public(result["conversation"]), "duplicate": result["duplicate"]}
    except (ValueError, ImportFailure) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not finalize the local recording") from exc


@api.get("/recordings/{recording_id}/preview")
def recording_preview_latest(recording_id: str) -> dict[str, object]:
    try:
        return recording_preview.latest(recording_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/recordings/{recording_id}/preview")
def recording_preview_generate(recording_id: str) -> dict[str, object]:
    try:
        return recording_preview.generate(recording_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Local preview transcription failed") from exc


def _read_notes(scope: str, item_id: str) -> dict[str, object]:
    try:
        return notes.get(scope, item_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _dates(request) -> dict | None:
    """The editor's resolved due dates by task ID; a null entry clears the date."""
    if request.todo_dates is None:
        return None
    return {key: value.model_dump() if value else None for key, value in request.todo_dates.items()}


def _write_notes(scope: str, item_id: str, request: NotesWrite) -> dict[str, object]:
    try:
        return notes.save(scope, item_id, request.markdown, request.expected_revision, _dates(request))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


class PageCategories(BaseModel):
    category_ids: list[str] = Field(max_length=200)


def _page_call(call, *args):
    try:
        return call(*args)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except pages.TooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.get("/pages")
def list_pages(notebook_id: str | None = None) -> list[dict[str, object]]:
    return pages.list_pages(notebook_id)


@api.post("/pages", status_code=201)
def create_page(request: PageCreate) -> dict[str, object]:
    return _page_call(pages.create, request.title, request.notebook_id, request.markdown)


@api.get("/pages/{page_id}")
def read_page(page_id: str) -> dict[str, object]:
    return _page_call(pages.get, page_id)


@api.patch("/pages/{page_id}")
def rename_page(page_id: str, request: PageRename) -> dict[str, object]:
    return _page_call(pages.rename, page_id, request.title)


@api.put("/pages/{page_id}/markdown")
def save_page(page_id: str, request: PageWrite) -> dict[str, object]:
    return _page_call(pages.save, page_id, request.markdown, request.expected_revision, _dates(request))


@api.put("/pages/{page_id}/notebook")
def assign_page_notebook(page_id: str, request: NotebookAssignment) -> dict[str, object]:
    return _page_call(pages.assign_notebook, page_id, request.notebook_id)


@api.put("/pages/{page_id}/categories")
def set_page_categories(page_id: str, request: PageCategories) -> dict[str, object]:
    return _page_call(pages.set_categories, page_id, request.category_ids)


@api.post("/pages/{page_id}/trash")
def trash_page(page_id: str) -> dict[str, object]:
    return _page_call(pages.move_to_trash, page_id)


@api.get("/todos")
def gather_todos(notebook_id: str = "all", status: Literal["open", "done", "canceled"] = "open") -> dict[str, object]:
    return todos.gather(notebook_id, status)


@api.patch("/todos/{todo_id}")
def update_todo(todo_id: str, request: TodoStatus) -> dict[str, object]:
    try:
        return todos.set_status(todo_id, request.status)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class SuggestionIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class SuggestionPreview(SuggestionIds):
    decision: Literal["accept", "reject"]


class SuggestionAmend(BaseModel):
    values: dict


def _suggestion_call(call, *args, **kwargs):
    try:
        return call(*args, **kwargs)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.get("/suggestions")
def list_suggestions(target_kind: Literal["conversation", "page"] | None = None, target_id: str | None = None,
                     notebook_id: str | None = None) -> dict[str, object]:
    return {"suggestions": _suggestion_call(suggestions.list_pending, target_kind, target_id, notebook_id)}


@api.patch("/suggestions/{suggestion_id}")
def amend_suggestion(suggestion_id: str, request: SuggestionAmend) -> dict[str, object]:
    return _suggestion_call(suggestions.amend, suggestion_id, request.values)


@api.post("/suggestions/accept")
def accept_suggestions(request: SuggestionIds) -> dict[str, list[str]]:
    return _suggestion_call(suggestions.accept, request.ids)


@api.post("/suggestions/reject")
def reject_suggestions(request: SuggestionIds) -> dict[str, list[str]]:
    return _suggestion_call(suggestions.reject, request.ids)


@api.post("/suggestions/preview")
def preview_suggestions(request: SuggestionPreview) -> dict[str, object]:
    return _suggestion_call(suggestions.preview, request.ids, request.decision)


@api.get("/recordings/{recording_id}/notes")
def recording_notes(recording_id: str) -> dict[str, object]:
    return _read_notes("recording", recording_id)


@api.put("/recordings/{recording_id}/notes")
def save_recording_notes(recording_id: str, request: NotesWrite) -> dict[str, object]:
    return _write_notes("recording", recording_id, request)


@api.get("/conversations/{conversation_id}/notes")
def conversation_notes(conversation_id: str) -> dict[str, object]:
    return _read_notes("conversation", conversation_id)


@api.put("/conversations/{conversation_id}/notes")
def save_conversation_notes(conversation_id: str, request: NotesWrite) -> dict[str, object]:
    return _write_notes("conversation", conversation_id, request)


def _list_images(scope: str, item_id: str) -> list[dict[str, object]]:
    try:
        return images.list_images(scope, item_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


async def _add_image(scope: str, item_id: str, file: UploadFile,
                     media_position_ms: int, segment_id: str | None, caption: str,
                     start_offset: int | None = None, end_offset: int | None = None,
                     expected_revision: int | None = None) -> dict[str, object]:
    try:
        data = await file.read(images.MAX_UPLOAD_BYTES + 1)
        if len(data) > images.MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Image must be smaller than 12 MB")
        return images._public(images.add(scope, item_id, data, media_position_ms, segment_id, caption,
                                         start_offset, end_offset, expected_revision))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=507, detail="Could not save image locally") from exc


def _image_file(scope: str, item_id: str, image_id: str, download: bool) -> FileResponse:
    try:
        record = images.get(scope, item_id, image_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    path = images.path_for(record)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file is missing")
    return FileResponse(path, media_type="image/webp", filename=f"meeting-image-{image_id}.webp",
                        content_disposition_type="attachment" if download else "inline",
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


def _update_image_caption(scope: str, item_id: str, image_id: str, caption: str) -> dict[str, object]:
    try:
        return images.update_caption(scope, item_id, image_id, caption)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _delete_image(scope: str, item_id: str, image_id: str) -> dict[str, bool]:
    try:
        images.delete(scope, item_id, image_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": True}


@api.get("/recordings/{recording_id}/images")
def recording_images(recording_id: str) -> list[dict[str, object]]:
    return _list_images("recording", recording_id)


@api.post("/recordings/{recording_id}/images")
async def add_recording_image(recording_id: str, file: UploadFile = File(...),
                              media_position_ms: int = Form(...), caption: str = Form("")) -> dict[str, object]:
    return await _add_image("recording", recording_id, file, media_position_ms, None, caption)


@api.get("/conversations/{conversation_id}/images")
def conversation_images(conversation_id: str) -> list[dict[str, object]]:
    return _list_images("conversation", conversation_id)


@api.post("/conversations/{conversation_id}/images")
async def add_conversation_image(conversation_id: str, file: UploadFile = File(...),
                                 media_position_ms: int = Form(...), segment_id: str | None = Form(None),
                                 caption: str = Form(""), start_offset: int | None = Form(None),
                                 end_offset: int | None = Form(None), expected_revision: int | None = Form(None)) -> dict[str, object]:
    return await _add_image("conversation", conversation_id, file, media_position_ms, segment_id, caption,
                            start_offset, end_offset, expected_revision)


@api.get("/recordings/{recording_id}/images/{image_id}/file")
def recording_image_file(recording_id: str, image_id: str, download: bool = False) -> FileResponse:
    return _image_file("recording", recording_id, image_id, download)


@api.get("/conversations/{conversation_id}/images/{image_id}/file")
def conversation_image_file(conversation_id: str, image_id: str, download: bool = False) -> FileResponse:
    return _image_file("conversation", conversation_id, image_id, download)


@api.patch("/recordings/{recording_id}/images/{image_id}")
def edit_recording_image(recording_id: str, image_id: str, request: ImageCaption) -> dict[str, object]:
    return _update_image_caption("recording", recording_id, image_id, request.caption)


@api.patch("/conversations/{conversation_id}/images/{image_id}")
def edit_conversation_image(conversation_id: str, image_id: str, request: ImageCaption) -> dict[str, object]:
    return _update_image_caption("conversation", conversation_id, image_id, request.caption)


@api.delete("/recordings/{recording_id}/images/{image_id}")
def remove_recording_image(recording_id: str, image_id: str) -> dict[str, bool]:
    return _delete_image("recording", recording_id, image_id)


@api.delete("/conversations/{conversation_id}/images/{image_id}")
def remove_conversation_image(conversation_id: str, image_id: str) -> dict[str, bool]:
    return _delete_image("conversation", conversation_id, image_id)


@api.get("/recordings/{recording_id}/chat")
def recording_chat(recording_id: str) -> list[dict[str, object]]:
    try:
        return recording_ai.list_runs(recording_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/recordings/{recording_id}/chat")
def ask_during_recording(recording_id: str, request: RecordingQuestion) -> dict[str, object]:
    try:
        return recording_ai.request(recording_id, request.question)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@api.get("/conversations/{conversation_id}/recording-chat")
def conversation_recording_chat(conversation_id: str) -> list[dict[str, object]]:
    try:
        return recording_ai.list_conversation_runs(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.get("/recording-chat/{run_id}")
def recording_chat_run(run_id: str) -> dict[str, object]:
    try:
        return recording_ai.get_run(run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.get("/conversations/{conversation_id}/enhanced-notes")
def list_enhanced_notes(conversation_id: str) -> list[dict[str, object]]:
    try:
        return enhanced_notes.list_runs(conversation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/conversations/{conversation_id}/enhanced-notes")
def generate_enhanced_notes(conversation_id: str, request: EnhancedNotesRequest) -> dict[str, object]:
    try:
        return enhanced_notes.request(conversation_id, force=request.force)
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@api.get("/enhanced-notes/{run_id}")
def enhanced_note(run_id: str) -> dict[str, object]:
    try:
        return enhanced_notes.get_run(run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.put("/enhanced-notes/{run_id}")
def edit_enhanced_note(run_id: str, request: NotesWrite) -> dict[str, object]:
    try:
        return enhanced_notes.edit(run_id, request.markdown, request.expected_revision)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.get("/conversations/{conversation_id}")
def conversation(conversation_id: str) -> dict[str, object]:
    record = storage.get_conversation(conversation_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _public(record)


@api.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, request: ConversationRename) -> dict[str, object]:
    try:
        return _public(storage.rename_conversation(conversation_id, request.title))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
        return ai.public_run(ai.request_run(conversation_id, request.kind, request.question, request.force))
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


@api.post("/conversations/{conversation_id}/silence-scan")
def scan_conversation_silence(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        return processing.public_job(processing.request_silence_scan(conversation_id))
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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


@api.get("/conversations/{conversation_id}/import-reference")
def import_reference(conversation_id: str) -> dict[str, object]:
    if storage.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    reference = storage.get_import_reference(conversation_id)
    if reference is None:
        raise HTTPException(status_code=404, detail="No imported transcript reference")
    return reference


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


@api.post("/conversations/{conversation_id}/comments")
def add_comment(conversation_id: str, request: CommentSelection) -> dict[str, object]:
    try:
        return storage.add_comment(conversation_id, request.segment_id, request.start_offset,
                                   request.end_offset, request.body, request.expected_revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@api.patch("/conversations/{conversation_id}/comments/{comment_id}")
def update_comment(conversation_id: str, comment_id: str, request: CommentBody) -> dict[str, object]:
    try:
        return storage.update_comment(conversation_id, comment_id, request.body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.delete("/conversations/{conversation_id}/comments/{comment_id}")
def delete_comment(conversation_id: str, comment_id: str) -> dict[str, bool]:
    if not storage.delete_comment(conversation_id, comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
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
def vocabulary(kind: Literal["name", "other"] | None = None) -> list[dict[str, object]]:
    return storage.list_vocabulary(kind)


@api.post("/vocabulary")
def add_vocabulary(term: VocabularyCreate) -> dict[str, object]:
    cleaned = term.term.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Vocabulary term cannot be empty")
    try:
        return storage.add_vocabulary(cleaned, term.kind)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Vocabulary term already exists") from exc


@api.patch("/vocabulary/{term_id}")
def update_vocabulary(term_id: str, term: VocabularyTerm) -> dict[str, object]:
    cleaned = term.term.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Vocabulary term cannot be empty")
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


@api.post("/vocabulary/batch")
def add_vocabulary_batch(request: VocabularyBatch) -> dict[str, object]:
    terms = [term.strip() for term in request.terms]
    if any(not term or len(term) > 100 for term in terms):
        raise HTTPException(status_code=400, detail="Each term must be 1–100 characters")
    return storage.add_vocabulary_batch(terms, request.kind)


@api.post("/vocabulary/move")
def move_vocabulary(request: VocabularyMove) -> dict[str, int]:
    ids = list(dict.fromkeys(request.ids))
    try:
        return {"moved": storage.move_vocabulary(ids, request.kind)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api.post("/vocabulary/delete")
def delete_vocabulary_selected(request: VocabularySelection) -> dict[str, int]:
    ids = list(dict.fromkeys(request.ids))
    try:
        return {"deleted": storage.delete_vocabulary_batch(ids)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
