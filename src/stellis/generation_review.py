"""Explicit review of user overlays before activating changed ASR boundaries."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from difflib import SequenceMatcher

from stellis import storage


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _candidates(source: dict[str, object], targets: list[dict[str, object]]) -> list[dict[str, object]]:
    start, end = int(source["start_ms"]), int(source["end_ms"])
    duration = max(1, end - start)
    ranked = []
    for target in targets:
        overlap = max(0, min(end, int(target["end_ms"])) - max(start, int(target["start_ms"])))
        if not overlap and abs(int(target["start_ms"]) - start) > 500:
            continue
        similarity = SequenceMatcher(None, str(source["text"]).casefold(),
                                     str(target["text"]).casefold()).ratio()
        score = round(.6 * overlap / duration + .4 * similarity, 3)
        ranked.append({"segment_id": target["id"], "start_ms": target["start_ms"],
                       "end_ms": target["end_ms"], "text": target["text"],
                       "overlap": round(overlap / duration, 3),
                       "text_similarity": round(similarity, 3), "score": score})
    overlapping = [item for item in ranked if item["overlap"] > 0]
    return sorted(overlapping or ranked, key=lambda item: (-item["score"], item["start_ms"]))[:5]


def stage(record: dict[str, object]) -> bool:
    """Retain a candidate and old transcript when changed IDs would hide overlays."""
    conversation_id = str(record["conversation_id"])
    current = storage.get_transcript(conversation_id)
    if current is None:
        return False
    source = json.loads(str(current["segments_json"]))
    targets = json.loads(str(record["segments_json"]))
    target_ids = {str(item["id"]) for item in targets}
    removed = {str(item["id"]) for item in source} - target_ids
    target_by_id = {str(item["id"]): item for item in targets}
    changed_clusters = {str(item["id"]) for item in source if str(item["id"]) in target_by_id and
                        item.get("speaker_cluster_id") != target_by_id[str(item["id"])].get("speaker_cluster_id")}
    if not removed and not changed_clusters:
        return False
    display = storage.get_display_transcript(conversation_id)
    if display is None:
        return False
    source_by_id = {str(item["id"]): item for item in display["segments"]}
    machine_by_id = {str(item["id"]): item for item in source}
    overlays: list[dict[str, object]] = []
    for segment_id, text in storage.get_transcript_edits(conversation_id).items():
        overlays.append({"kind": "text", "source_segment_id": segment_id, "value": text})
    for label in storage.get_speaker_labels(conversation_id):
        if label["scope"] == "segment":
            overlays.append({"kind": "speaker", "source_segment_id": label["target_id"], "value": label["name"]})
        else:
            for segment in source:
                if segment.get("speaker_cluster_id") == label["target_id"]:
                    overlays.append({"kind": "speaker", "source_segment_id": segment["id"],
                                     "value": label["name"], "cluster_label": True})
    for highlight in storage.list_highlights(conversation_id):
        overlays.append({"kind": "highlight", "source_segment_id": highlight["segment_id"],
                         "value": highlight["quote"], "source_highlight_id": highlight["id"]})
    with storage.connect() as conn:
        people = conn.execute("SELECT segment_id, person_id FROM person_links WHERE conversation_id = ?",
                              (conversation_id,)).fetchall()
    for link in people:
        overlays.append({"kind": "person", "source_segment_id": link["segment_id"], "value": link["person_id"]})
    items = []
    for index, overlay in enumerate(overlays):
        source_id = str(overlay["source_segment_id"])
        if (source_id not in removed and source_id not in changed_clusters and not overlay.get("cluster_label")) or source_id not in source_by_id:
            continue
        segment = source_by_id[source_id]
        candidates = _candidates(machine_by_id[source_id], targets)
        best = candidates[0] if candidates else None
        high_confidence = bool(len(candidates) == 1 and best and best["overlap"] >= .8 and
                               best["text_similarity"] >= .8)
        boundary = "split" if len(candidates) > 1 else "missing" if not candidates else (
            "merge" if int(candidates[0]["end_ms"]) - int(candidates[0]["start_ms"]) >
            1.6 * max(1, int(segment["end_ms"]) - int(segment["start_ms"])) else "single")
        items.append({"id": f"overlay-{index}", **overlay, "source_text": segment["text"],
                      "source_start_ms": segment["start_ms"], "source_end_ms": segment["end_ms"],
                      "source_speaker": segment["speaker_display_name"], "candidates": candidates,
                      "suggestion": best["segment_id"] if high_confidence else None,
                      "boundary_change": boundary})
    if not items:
        return False
    stamp = _now()
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        live = conn.execute("SELECT revision, generation_version FROM transcripts WHERE conversation_id = ?",
                            (conversation_id,)).fetchone()
        if live is None or live["revision"] != current["revision"] or live["generation_version"] != current["generation_version"]:
            raise RuntimeError("Transcript changed during retranscription; retry the job")
        conn.execute("""INSERT OR IGNORE INTO transcript_generations
            (conversation_id, pipeline_version, revision, language, segments_json, turns_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (conversation_id, record["pipeline_version"], int(current["revision"]) + 1,
             record["language"], record["segments_json"], record["turns_json"], record["updated_at"]))
        conn.execute("""INSERT INTO transcript_reviews
            (conversation_id, source_version, target_version, source_revision, items_json, decisions_json,
             state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '{}', 'pending', ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET source_version=excluded.source_version,
            target_version=excluded.target_version, source_revision=excluded.source_revision,
            items_json=excluded.items_json, decisions_json='{}', state='pending', updated_at=excluded.updated_at""",
            (conversation_id, current["generation_version"], record["pipeline_version"],
             current["revision"], json.dumps(items), stamp, stamp))
    return True


def get_review(conversation_id: str) -> dict[str, object] | None:
    with storage.connect() as conn:
        row = conn.execute("SELECT * FROM transcript_reviews WHERE conversation_id = ?", (conversation_id,)).fetchone()
    if row is None:
        return None
    if row["state"] == "accepted":
        current = storage.get_transcript(conversation_id)
        if current is None or current["generation_version"] != row["target_version"]:
            return None
    return {"conversation_id": conversation_id, "source_version": row["source_version"],
            "target_version": row["target_version"], "source_revision": row["source_revision"],
            "state": row["state"], "items": json.loads(str(row["items_json"])),
            "decisions": json.loads(str(row["decisions_json"])), "updated_at": row["updated_at"]}


def list_history(conversation_id: str) -> list[dict[str, object]]:
    with storage.connect() as conn:
        rows = conn.execute("""SELECT source_version, target_version, source_revision, items_json,
            decisions_json, outcome, decided_at FROM transcript_review_history
            WHERE conversation_id = ? ORDER BY decided_at DESC""", (conversation_id,)).fetchall()
    return [{"source_version": row["source_version"], "target_version": row["target_version"],
             "source_revision": row["source_revision"], "outcome": row["outcome"],
             "decided_at": row["decided_at"], "items": json.loads(str(row["items_json"])),
             "decisions": json.loads(str(row["decisions_json"]))} for row in rows]


def decide(conversation_id: str, item_id: str, target_segment_id: str | None) -> dict[str, object]:
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM transcript_reviews WHERE conversation_id = ? AND state = 'pending'",
                           (conversation_id,)).fetchone()
        if row is None:
            raise LookupError("No pending transcript review")
        items = json.loads(str(row["items_json"]))
        item = next((value for value in items if value["id"] == item_id), None)
        if item is None:
            raise LookupError("Review item not found")
        if target_segment_id is not None and target_segment_id not in {value["segment_id"] for value in item["candidates"]}:
            raise ValueError("Choose a listed candidate passage")
        decisions = json.loads(str(row["decisions_json"]))
        decisions[item_id] = target_segment_id
        conn.execute("UPDATE transcript_reviews SET decisions_json = ?, updated_at = ? WHERE conversation_id = ?",
                     (json.dumps(decisions), _now(), conversation_id))
    return {"item_id": item_id, "target_segment_id": target_segment_id}


def activate(conversation_id: str) -> dict[str, object]:
    """Switch generations and apply only mappings the user explicitly selected."""
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        review = conn.execute("SELECT * FROM transcript_reviews WHERE conversation_id = ? AND state = 'pending'",
                              (conversation_id,)).fetchone()
        if review is None:
            raise LookupError("No pending transcript review")
        current = conn.execute("SELECT * FROM transcripts WHERE conversation_id = ?", (conversation_id,)).fetchone()
        if current is None or current["revision"] != review["source_revision"] or current["generation_version"] != review["source_version"]:
            raise RuntimeError("The source transcript changed. Keep the current version and reprocess again")
        target = conn.execute("""SELECT * FROM transcript_generations WHERE conversation_id = ? AND pipeline_version = ?""",
                              (conversation_id, review["target_version"])).fetchone()
        if target is None:
            raise LookupError("Candidate transcript missing")
        target_segments = {str(item["id"]): item for item in json.loads(str(target["segments_json"]))}
        items = json.loads(str(review["items_json"]))
        decisions = json.loads(str(review["decisions_json"]))
        if any(item["id"] not in decisions for item in items):
            raise RuntimeError("Choose a target passage or keep unresolved for every review item")
        mappings = [(item, decisions[item["id"]]) for item in items if decisions[item["id"]] is not None]
        seen: set[tuple[str, str]] = set()
        for item, target_id in mappings:
            key = (item["kind"], target_id)
            if target_id not in target_segments or key in seen:
                raise RuntimeError("Two source changes cannot map to the same target passage and kind")
            seen.add(key)
            if item["kind"] == "highlight" and str(item["value"]) not in str(target_segments[target_id]["text"]):
                raise RuntimeError("The highlighted quote is absent from the chosen target passage")
        stamp = _now()
        # Cluster IDs are provisional across a fresh ASR/diarization pass.
        conn.execute("DELETE FROM speaker_labels WHERE conversation_id = ? AND scope = 'cluster'",
                     (conversation_id,))
        for item, target_id in mappings:
            if item["kind"] == "text":
                conn.execute("""INSERT INTO transcript_edits (conversation_id, segment_id, text, updated_at)
                    VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, segment_id) DO UPDATE SET
                    text=excluded.text, updated_at=excluded.updated_at""", (conversation_id, target_id, item["value"], stamp))
            elif item["kind"] == "speaker":
                conn.execute("""INSERT INTO speaker_labels (conversation_id, scope, target_id, name, updated_at)
                    VALUES (?, 'segment', ?, ?, ?) ON CONFLICT(conversation_id, scope, target_id) DO UPDATE SET
                    name=excluded.name, updated_at=excluded.updated_at""", (conversation_id, target_id, item["value"], stamp))
            elif item["kind"] == "person":
                conn.execute("""INSERT INTO person_links (conversation_id, segment_id, person_id, start_ms, confirmed_at)
                    VALUES (?, ?, ?, ?, ?) ON CONFLICT(conversation_id, segment_id) DO UPDATE SET
                    person_id=excluded.person_id, start_ms=excluded.start_ms, confirmed_at=excluded.confirmed_at""",
                    (conversation_id, target_id, item["value"], target_segments[target_id]["start_ms"], stamp))
            elif item["kind"] == "highlight":
                quote = str(item["value"])
                start = str(target_segments[target_id]["text"]).index(quote)
                conn.execute("""INSERT INTO transcript_highlights
                    (id, conversation_id, segment_id, start_offset, end_offset, quote, created_at)
                    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)""",
                    (conversation_id, target_id, start, start + len(quote), quote, stamp))
        conn.execute("""UPDATE transcripts SET revision = ?, generation_version = ?, language = ?,
            segments_json = ?, turns_json = ?, updated_at = ? WHERE conversation_id = ?""",
            (int(current["revision"]) + 1, target["pipeline_version"], target["language"],
             target["segments_json"], target["turns_json"], stamp, conversation_id))
        conn.execute("UPDATE transcript_reviews SET state = 'accepted', updated_at = ? WHERE conversation_id = ?",
                     (stamp, conversation_id))
        conn.execute("""INSERT OR REPLACE INTO transcript_review_history
            (conversation_id, target_version, source_version, source_revision, items_json,
             decisions_json, outcome, decided_at) VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?)""",
            (conversation_id, review["target_version"], review["source_version"], review["source_revision"],
             review["items_json"], review["decisions_json"], stamp))
    return {"generation_version": target["pipeline_version"], "migrated": len(mappings),
            "unresolved": len(items) - len(mappings)}


def keep_source(conversation_id: str) -> dict[str, object]:
    with storage.connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        review = conn.execute("SELECT * FROM transcript_reviews WHERE conversation_id = ? AND state = 'pending'",
                              (conversation_id,)).fetchone()
        if review is None:
            raise LookupError("No pending transcript review")
        conn.execute("""INSERT OR REPLACE INTO transcript_review_history
            (conversation_id, target_version, source_version, source_revision, items_json,
             decisions_json, outcome, decided_at) VALUES (?, ?, ?, ?, ?, ?, 'kept_source', ?)""",
            (conversation_id, review["target_version"], review["source_version"], review["source_revision"],
             review["items_json"], review["decisions_json"], _now()))
        conn.execute("DELETE FROM transcript_reviews WHERE conversation_id = ?", (conversation_id,))
    return {"kept_source": True}
