"""Notebook sources: which items a notebook's chat can read, their status, and the saved selection."""
import json
import os
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import notebook_sources, notebooks, pages, storage
from stellis.server import app


def _stamp(minute: int) -> str:
    return datetime(2026, 10, 21, 12, minute, tzinfo=timezone.utc).isoformat()


class NotebookSourcesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.book = notebooks.create("Cardiology")["id"]
        self.recording = self.conversation("Voice note", 1, transcript=True)
        self.audio = self.conversation("Clinic visit.mp3", 2, transcript=True)
        with storage.connect() as conn:
            conn.execute("""INSERT INTO recording_sessions (id, title, media_type, state, conversation_id, notebook_id,
                created_at, updated_at) VALUES (?, 'Voice note', 'audio/webm', 'finalized', ?, ?, ?, ?)""",
                         (str(uuid.uuid4()), self.recording, self.book, _stamp(1), _stamp(1)))
        self.note = pages.create("Questions for Dr. Lee", self.book, "Ask about the dose")["id"]
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def conversation(self, title: str, minute: int, *, transcript: bool, notebook_id: str | None = None) -> str:
        identifier = str(uuid.uuid4())
        storage.add_conversation({"id": identifier, "title": title, "source_sha256": identifier,
                                  "audio_filename": "a.mp3", "audio_media_type": "audio/mpeg", "duration_ms": 5000,
                                  "created_at": _stamp(minute), "notebook_id": notebook_id or self.book})
        if transcript:
            storage.save_transcript({"conversation_id": identifier, "revision": 1, "language": "en",
                                     "segments_json": json.dumps([]), "turns_json": "[]", "updated_at": _stamp(minute)})
        return identifier

    def job(self, conversation_id: str, state: str) -> None:
        storage.add_job({"id": str(uuid.uuid4()), "conversation_id": conversation_id, "pipeline_version": str(uuid.uuid4()),
                         "state": state, "stage": state, "progress": 0.0, "error": None, "metrics_json": None,
                         "vocabulary_json": "[]", "created_at": _stamp(30), "updated_at": _stamp(30)})

    def test_lists_recordings_audio_and_notes_with_types(self):
        self.conversation("Elsewhere", 5, transcript=True, notebook_id=notebooks.create("Dermatology")["id"])
        response = self.client.get(f"/api/v1/notebooks/{self.book}/sources")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["limit"], notebook_sources.LIMIT)
        self.assertEqual({(item["id"], item["type"]) for item in body["sources"]},
                         {("conversation:" + self.recording, "recording"), ("conversation:" + self.audio, "audio"),
                          ("page:" + self.note, "note")})
        self.assertTrue(all(item["status"] == "ready" and item["selected"] for item in body["sources"]))

    def test_a_source_without_text_shows_its_status_and_cannot_be_selected(self):
        queued, failed = self.conversation("Queued", 10, transcript=False), self.conversation("Broken", 11, transcript=False)
        self.job(queued, "queued")
        self.job(failed, "failed")
        sources = {item["id"]: item for item in notebook_sources.list_sources(self.book)}
        self.assertEqual(sources["conversation:" + queued]["status"], "processing")
        self.assertEqual(sources["conversation:" + failed]["status"], "failed")
        self.assertFalse(sources["conversation:" + queued]["selected"])
        self.assertFalse(sources["conversation:" + failed]["selected"])

    def test_selection_survives_a_reload_and_new_sources_arrive_checked(self):
        response = self.client.put(f"/api/v1/notebooks/{self.book}/sources/selection",
                                   json={"excluded": ["page:" + self.note, "page:unknown"]})
        self.assertEqual(response.status_code, 200)
        later = self.conversation("Follow-up", 20, transcript=True)
        selected = {item["id"]: item["selected"] for item in self.client.get(f"/api/v1/notebooks/{self.book}/sources").json()["sources"]}
        self.assertFalse(selected["page:" + self.note])
        self.assertTrue(selected["conversation:" + later])
        self.assertTrue(selected["conversation:" + self.audio])
        with storage.connect() as conn:
            stored = [row[0] for row in conn.execute("SELECT source_id FROM notebook_source_exclusions")]
        self.assertEqual(stored, ["page:" + self.note])

    def test_trashed_items_leave_the_list_and_unknown_notebooks_return_404(self):
        with storage.connect() as conn:
            conn.execute("UPDATE pages SET trashed_at = ? WHERE id = ?", (_stamp(40), self.note))
        self.assertNotIn("page:" + self.note, [item["id"] for item in notebook_sources.list_sources(self.book)])
        self.assertEqual(self.client.get("/api/v1/notebooks/missing/sources").status_code, 404)
        self.assertEqual(self.client.put("/api/v1/notebooks/missing/sources/selection", json={"excluded": []}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
