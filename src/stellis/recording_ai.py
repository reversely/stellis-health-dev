"""Nebius answers grounded in a saved on-device provisional transcript snapshot."""

from __future__ import annotations

import json
import threading
import uuid

from stellis import ai, recording_preview, storage

MAX_PREVIEW_SEGMENTS = 500


def _row(run_id: str):
    with storage.connect() as conn:
        return conn.execute("SELECT * FROM recording_ai_runs WHERE id = ?", (run_id,)).fetchone()


def _update(run_id: str, **fields: object) -> None:
    fields["updated_at"] = ai._now()
    with storage.connect() as conn:
        conn.execute(f"UPDATE recording_ai_runs SET {', '.join(f'{key} = ?' for key in fields)} WHERE id = ?",
                     (*fields.values(), run_id))


def public(row) -> dict[str, object]:
    return {key: row[key] for key in ("id", "recording_id", "question", "model_id", "state", "stage",
                                      "attempts", "error_code", "error_message", "created_at", "updated_at")} | {
        "result": json.loads(str(row["result_json"])) if row["result_json"] else None,
        "source_starts": json.loads(str(row["source_starts_json"])),
        "usage": json.loads(str(row["usage_json"])),
        "provider_request_ids": json.loads(str(row["provider_request_ids_json"])),
    }


def list_runs(recording_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        owner = conn.execute("SELECT id FROM recording_sessions WHERE id = ?", (recording_id,)).fetchone()
        if owner is None:
            raise LookupError("Recording session not found")
        rows = conn.execute("SELECT * FROM recording_ai_runs WHERE recording_id = ? ORDER BY created_at",
                            (recording_id,)).fetchall()
    return [public(row) for row in rows]


def list_conversation_runs(conversation_id: str) -> list[dict[str, object]]:
    if storage.get_conversation(conversation_id) is None:
        raise LookupError("Conversation not found")
    with storage.connect() as conn:
        rows = conn.execute("""SELECT recording_ai_runs.* FROM recording_ai_runs
            JOIN recording_sessions ON recording_sessions.id = recording_ai_runs.recording_id
            WHERE recording_sessions.conversation_id = ? ORDER BY recording_ai_runs.created_at""",
            (conversation_id,)).fetchall()
    return [public(row) for row in rows]


def get_run(run_id: str) -> dict[str, object]:
    row = _row(run_id)
    if row is None:
        raise LookupError("Live chat answer not found")
    return public(row)


def request(recording_id: str, question: str) -> dict[str, object]:
    question = question.strip()
    if not question or len(question) > 500:
        raise ValueError("Enter a shorter question")
    if not ai._key():
        raise ai.AIError("not_configured", "Add a Nebius API key to use AI Chat")
    with storage.connect() as conn:
        owner = conn.execute("SELECT state FROM recording_sessions WHERE id = ?", (recording_id,)).fetchone()
    if owner is None:
        raise LookupError("Recording session not found")
    if owner["state"] != "recording":
        raise RuntimeError("Recording is already finalized")
    preview = recording_preview.latest(recording_id)
    segments = preview["segments"][-MAX_PREVIEW_SEGMENTS:]
    if not segments:
        raise RuntimeError("Live transcript is not ready")
    snapshot = [{"id":f"live-{index}-{int(item['start_ms'])}", "start_ms":int(item["start_ms"]),
                 "end_ms":int(item["end_ms"]), "text":str(item["text"]),
                 "speaker_display_name":"Unknown speaker"}
                for index, item in enumerate(segments)]
    stamp = ai._now()
    run_id = str(uuid.uuid4())
    with storage.connect() as conn:
        conn.execute("""INSERT INTO recording_ai_runs
            (id, recording_id, question, input_segments_json, source_starts_json, model_id,
             state, stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', 'queued', ?, ?)""",
            (run_id, recording_id, question, json.dumps(snapshot),
             json.dumps({item["id"]:item["start_ms"] for item in snapshot}), ai.MODEL_ID, stamp, stamp))
    threading.Thread(target=_run, args=(run_id,), daemon=True).start()
    return get_run(run_id)


def _run(run_id: str) -> None:
    row = _row(run_id)
    if row is None:
        return
    metadata: dict[str, object] = {"usage": json.loads(str(row["usage_json"])),
                                   "request_ids": json.loads(str(row["provider_request_ids_json"])),
                                   "attempts": int(row["attempts"])}
    try:
        _update(run_id, state="running", stage="answering")
        segments = json.loads(str(row["input_segments_json"]))
        question = str(row["question"])
        result = ai._answer(segments, question, metadata, provisional=True)
        _update(run_id, state="succeeded", stage="complete", result_json=json.dumps(result),
                usage_json=json.dumps(metadata["usage"]),
                provider_request_ids_json=json.dumps(metadata["request_ids"]), attempts=metadata["attempts"],
                error_code=None, error_message=None)
    except ai.AIError as exc:
        _update(run_id, state="failed", stage="failed", error_code=exc.code, error_message=str(exc),
                usage_json=json.dumps(metadata["usage"]),
                provider_request_ids_json=json.dumps(metadata["request_ids"]), attempts=metadata["attempts"])
    except Exception:
        _update(run_id, state="failed", stage="failed", error_code="unexpected",
                error_message="AI Chat stopped unexpectedly", usage_json=json.dumps(metadata["usage"]),
                provider_request_ids_json=json.dumps(metadata["request_ids"]), attempts=metadata["attempts"])


def fail_interrupted() -> None:
    with storage.connect() as conn:
        conn.execute("""UPDATE recording_ai_runs SET state = 'failed', stage = 'failed',
            error_code = 'interrupted', error_message = 'Answer was interrupted. Ask again', updated_at = ?
            WHERE state IN ('queued', 'running')""", (ai._now(),))
