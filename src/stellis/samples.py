"""Sample workspace: AMI Meeting Corpus meetings plus invented notes, notebooks, to-dos and suggestions.

The AMI Meeting Corpus is published by the University of Edinburgh under the
Creative Commons Attribution 4.0 licence (https://groups.inf.ed.ac.uk/ami/corpus/license.shtml).
Each sample is a four-person design meeting played by actors. Stellis downloads
the mixed headset recording, checks its SHA-256 digest, converts it to MP3, and
imports it like any other recording, so transcription runs as usual. The invented content (sample_content.py)
needs no network and no Nebius key. Everything created is recorded in the sample_items table, so adding twice
adds nothing and removing deletes only those items.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import tempfile
import threading
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from starlette.datastructures import UploadFile

from stellis import collections, importer, library, notebooks, notes, pages, processing, sample_content, storage, suggestions, todos, tools

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


def _expected_keys() -> set[str]:
    return ({f"tag:{name}" for name in sample_content.TAGS}
            | {f"collection:{key}" for key, *_ in sample_content.COLLECTIONS}
            | {f"notebook:{key}" for key, *_ in sample_content.NOTEBOOKS}
            | {f"page:{key}" for key, *_ in sample_content.PAGES})


def status() -> dict[str, object]:
    with _LOCK:
        state = dict(_STATE)
    present, items = added(), _items()
    complete = len(present) == len(SAMPLES) and _expected_keys() <= set(items)
    return {**state, "added": present, "total": len(SAMPLES), "complete": complete,
            "installed": bool(present or any(made for _, _, made in items.values()))}


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


def _items() -> dict[str, tuple[str, str, bool]]:
    """Sample key to (kind, item id, created by the sample)."""
    with storage.connect() as conn:
        return {str(row["key"]): (str(row["kind"]), str(row["item_id"]), bool(row["created"]))
                for row in conn.execute("SELECT key, kind, item_id, created FROM sample_items")}


def _mark(key: str, kind: str, item_id: str, created: bool = True) -> None:
    with storage.connect() as conn:
        conn.execute("INSERT OR REPLACE INTO sample_items (key, kind, item_id, created) VALUES (?, ?, ?, ?)",
                     (key, kind, item_id, int(created)))


def _ensure(key: str, kind: str, table: str, name: str, create) -> str:
    """The ID for a sample collection, notebook or tag: recorded, else the user's own of that name, else created."""
    known = _items()
    if key in known:
        return known[key][1]
    with storage.connect() as conn:
        row = conn.execute(f"SELECT id FROM {table} WHERE normalized = ?", (name.casefold(),)).fetchone()
    if row:  # Never take over, or later delete, something the user made.
        _mark(key, kind, str(row["id"]), False)
        return str(row["id"])
    item_id = str(create()["id"])
    _mark(key, kind, item_id)
    return item_id


def _due_dates(markdown: str, due: dict[str, tuple[int, str | None]]) -> dict[str, dict[str, str | None]]:
    today = date.today()
    return {task.id: {"due_date": (today + timedelta(days=due[task.text][0])).isoformat(), "due_time": due[task.text][1]}
            for task in todos.parse_tasks(markdown) if task.id and task.text in due}


def _new_notebook(name: str, collection_id: str | None, setting: str) -> dict[str, object]:
    record = notebooks.create(name)
    if setting != "inherit":
        notebooks.update(str(record["id"]), todo_list=setting)
    if collection_id:
        collections.assign_notebook(str(record["id"]), collection_id)
    return record


def _new_collection(name: str, setting: str) -> dict[str, object]:
    record = collections.create(name)
    collections.update(str(record["id"]), todo_list=setting)
    return record


def seed_workspace() -> None:
    """Add the invented content. Needs no network and no Nebius key; a second call adds nothing."""
    content = sample_content
    tags = {name: _ensure(f"tag:{name}", "tag", "categories", name, lambda name=name: library.create_category(name))
            for name in content.TAGS}
    groups = {key: _ensure(f"collection:{key}", "collection", "collections", name,
                           lambda name=name, setting=setting: _new_collection(name, setting))
              for key, name, setting in content.COLLECTIONS}
    books = {key: _ensure(f"notebook:{key}", "notebook", "notebooks", name,
                          lambda name=name, group=group, setting=setting: _new_notebook(name, groups.get(group), setting))
             for key, name, group, setting in content.NOTEBOOKS}
    for key, title, book, tag_names, markdown, due in content.PAGES:
        if f"page:{key}" in _items():
            continue
        if book is None and title == "To-dos":
            # The To-dos widget keeps one uncategorized note by this title; an existing one is the user's.
            mine = next((page for page in pages.list_pages("none") if page["title"] == title), None)
            if mine:
                _mark(f"page:{key}", "page", str(mine["id"]), False)
                continue
        page = pages.create(title, books.get(book), markdown)
        _mark(f"page:{key}", "page", str(page["id"]))
        dates = _due_dates(str(page["markdown"]), due)
        if dates:
            pages.save(str(page["id"]), str(page["markdown"]), int(page["revision"]), dates)
        if tag_names:
            pages.set_categories(str(page["id"]), [tags[name] for name in tag_names])


def _seed_meeting_notes(meeting: str, conversation_id: str) -> str | None:
    """Credit plus sample to-dos, unless the user already wrote their own notes. Returns the saved Markdown."""
    _, _, lines, due = sample_content.MEETINGS[meeting]
    current = notes.get("conversation", conversation_id)
    credit = CREDIT.format(id=meeting)
    if current["markdown"] not in ("", credit):
        return None
    saved = notes.save("conversation", conversation_id,
                       credit + "\n\n## To-dos\n\n" + "\n".join(lines), int(current["revision"]))
    dates = _due_dates(str(saved["markdown"]), due)
    if dates:
        saved = notes.save("conversation", conversation_id, str(saved["markdown"]), int(saved["revision"]), dates)
    return str(saved["markdown"])


def _seed_suggestions(meeting: str, conversation_id: str, markdown: str | None) -> None:
    """Pending Transcript Agent suggestions, made through suggestions.propose like the real agent's."""
    task = next((task for task in todos.parse_tasks(markdown or "") if task.text == sample_content.SUGGESTED_DONE), None)
    for operation, values, (segment, quote) in sample_content.SUGGESTIONS.get(meeting, ()):
        if operation == "set_todo_status" and task is None:
            continue
        try:
            suggestions.propose("transcript-agent", "conversation", conversation_id, operation, values,
                                todo_id=task.id if operation == "set_todo_status" else None,
                                source_kind="conversation", source_id=conversation_id,
                                evidence=[{"segment_id": segment, "quote": quote}])
        except PermissionError:
            return  # The notebook already existed with its to-do list off.


def _seed_meetings() -> None:
    """File, tag, note and annotate each sample meeting that is in the library and was added by the sample."""
    present = set(added())
    for meeting, conversation_id in _index().items():
        if meeting not in sample_content.MEETINGS or meeting not in present:
            continue
        items = _items()
        if f"conversation:{meeting}" not in items:  # Added before the workspace existed.
            _mark(f"conversation:{meeting}", "conversation", conversation_id)
        elif not items[f"conversation:{meeting}"][2] or f"meeting:{meeting}" in items:
            continue
        book, tag_names, _, _ = sample_content.MEETINGS[meeting]
        _mark(f"meeting:{meeting}", "marker", conversation_id)
        if f"notebook:{book}" in items:
            notebooks.assign(conversation_id, items[f"notebook:{book}"][1])
        for name in tag_names:
            if f"tag:{name}" in items:
                library.set_category(conversation_id, items[f"tag:{name}"][1], True)
        markdown = _seed_meeting_notes(meeting, conversation_id)
        if markdown is not None:
            _seed_suggestions(meeting, conversation_id, markdown)


def _delete(item_id: str, *steps) -> None:
    """Trash then permanently delete; an item the user already removed is skipped."""
    for step in steps:
        try:
            step(item_id)
        except LookupError:
            pass


def remove() -> dict[str, object]:
    """Delete everything the sample created, and nothing else. Items already deleted are skipped."""
    with _LOCK:
        if _THREAD and _THREAD.is_alive():
            raise RuntimeError("Wait for the sample download to finish before removing the sample workspace")
    created = [(kind, item_id) for kind, item_id, made in _items().values() if made]

    def ids(wanted: str) -> list[str]:
        return [item_id for kind, item_id in created if kind == wanted]

    removed = set(ids("conversation"))
    for item_id in ids("conversation"):
        _delete(item_id, library.move_to_trash, library.delete_permanently)
    for item_id in ids("page"):
        _delete(item_id, pages.move_to_trash, pages.delete_permanently)
    for item_id in ids("notebook"):
        notebooks.delete(item_id)
    for item_id in ids("collection"):
        collections.delete(item_id)
    for item_id in ids("tag"):
        with storage.connect() as conn:
            used = conn.execute("""SELECT 1 FROM conversation_categories WHERE category_id = ? UNION ALL
                SELECT 1 FROM page_categories WHERE category_id = ?""", (item_id, item_id)).fetchone()
        if not used:  # A tag the user has since applied to their own items stays.
            library.delete_category(item_id)
    with storage.connect() as conn:
        conn.execute("DELETE FROM sample_items")
    _index_path().write_text(json.dumps({meeting: conversation for meeting, conversation in _index().items()
                                         if conversation not in removed}))
    return status()


def install(cache: Path | None = None) -> None:
    """Add every sample not already in the library; stop at the first failure."""
    cache = cache or _cache()
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        seed_workspace()
        _seed_meetings()
    except Exception as exc:  # Shown in the app like a download error.
        _set(state="failed", error=str(exc) or "The sample workspace could not be added")
        return
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
                _mark(f"conversation:{meeting}", "conversation", conversation_id, not duplicate)
                if not duplicate:
                    storage.rename_conversation(conversation_id, f"{title} (AMI {meeting})")
                    library.set_category(conversation_id, _meetings_category(), True)
                    # Without the speech models yet, models.install queues it once they arrive.
                    if ready["transcribe"] and ready["diarize"]:
                        processing.request_processing(conversation_id)
                index_data = _index()
                index_data[meeting] = conversation_id
                _index_path().write_text(json.dumps(index_data))
                _seed_meetings()
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
