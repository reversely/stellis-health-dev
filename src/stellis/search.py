"""Device-local search over the current displayed transcript revision."""

from __future__ import annotations

from stellis import library, storage


def _excerpt(value: str, query: str, width: int = 120) -> str:
    position = value.casefold().find(query.casefold())
    if position < 0 or len(value) <= width:
        return value
    start = max(0, position - 38)
    end = min(len(value), start + width)
    start = max(0, end - width)
    return ("…" if start else "") + value[start:end] + ("…" if end < len(value) else "")


def search_library(query: str, limit: int = 150, category_id: str | None = None) -> dict[str, object]:
    """Search effective text and labels afresh, so overlays never need a stale index."""
    needle = query.strip().casefold()
    if len(needle) < 2 or len(needle) > 120:
        raise ValueError("Enter 2–120 characters to search")
    results: list[dict[str, object]] = []
    total = 0
    conversations = storage.list_conversations()
    if category_id is not None:
        assigned = library.assignments()
        if category_id == "uncategorized":
            conversations = [item for item in conversations if not assigned.get(str(item["id"]))]
        else:
            conversations = [item for item in conversations
                             if category_id in assigned.get(str(item["id"]), [])]
    for conversation in conversations:
        conversation_id = str(conversation["id"])
        title = str(conversation["title"])
        display = storage.get_display_transcript(conversation_id)
        segments = display["segments"] if display else []
        if needle in title.casefold():
            total += 1
            if len(results) < limit:
                results.append({"kind": "conversation", "conversation_id": conversation_id,
                                "conversation_title": title, "revision": display["revision"] if display else None,
                                "segment_id": None, "start_ms": 0, "speaker": None,
                                "speaker_uncertain": False, "excerpt": title})
        seen_speakers: set[str] = set()
        for segment in segments:
            speaker = str(segment["speaker_display_name"])
            common = {"conversation_id": conversation_id, "conversation_title": title,
                      "revision": display["revision"], "segment_id": segment["id"],
                      "start_ms": segment["start_ms"], "speaker": speaker,
                      "speaker_uncertain": bool(segment.get("speaker_uncertain", False))}
            if needle in speaker.casefold() and speaker not in seen_speakers:
                seen_speakers.add(speaker)
                total += 1
                if len(results) < limit:
                    results.append({**common, "kind": "speaker", "excerpt": speaker})
            value = str(segment["text"])
            if needle in value.casefold():
                total += 1
                if len(results) < limit:
                    results.append({**common, "kind": "passage", "excerpt": _excerpt(value, query)})
    return {"query": query.strip(), "total": total, "limited": total > limit, "results": results}
