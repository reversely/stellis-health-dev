"""Sample meetings are added from the app, pinned by SHA-256 and filed under Meetings (#224)."""

from __future__ import annotations

import os
import json
import re
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import collections, library, notebooks, pages, samples, storage, suggestions, todos


class SamplesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name, "STELLIS_AUTH_MODE": "off"})
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()
        self.temp.cleanup()
        samples._STATE.update(state="idle", meeting=None, progress=0.0, error=None)

    def test_every_sample_has_a_pinned_sha256_and_a_title(self) -> None:
        self.assertEqual(len(samples.SAMPLES), 3)
        for meeting, title, digest in samples.SAMPLES:
            self.assertRegex(meeting, r"^[A-Z]{2}\d{4}[a-d]$")
            self.assertTrue(title)
            self.assertTrue(re.fullmatch(r"[0-9a-f]{64}", digest))

    def test_samples_go_under_meetings_even_after_it_was_deleted(self) -> None:
        seeded = {item["name"]: item["id"] for item in library.categories()}
        self.assertEqual(samples._meetings_category(), seeded["Meetings"])
        library.delete_category(seeded["Meetings"])
        created = samples._meetings_category()
        self.assertEqual(next(item["name"] for item in library.categories() if item["id"] == created), "Meetings")

    def test_a_download_that_fails_its_checksum_is_removed_and_reported(self) -> None:
        cache = Path(self.temp.name, "cache"); cache.mkdir()
        (cache / "ES2002a.Mix-Headset.wav").write_bytes(b"not the meeting")
        with patch.object(samples, "SAMPLES", (("ES2002a", "Kickoff", "0" * 64),)):
            samples.install(cache)
        self.assertFalse((cache / "ES2002a.Mix-Headset.wav").exists())
        state = samples.status()
        self.assertEqual(state["state"], "failed")
        self.assertIn("checksum", state["error"])
        self.assertEqual(state["added"], [])

    def test_a_deleted_sample_counts_as_not_added(self) -> None:
        samples._index_path().write_text('{"ES2002a": "gone"}')
        self.assertEqual(samples.added(), [])

    def add_meeting(self, meeting="ES2002a") -> str:
        """A stand-in for a downloaded AMI meeting, so the tests never touch the network."""
        conversation_id = str(uuid.uuid4())
        storage.add_conversation({"id": conversation_id, "title": meeting, "source_sha256": conversation_id,
                                  "audio_filename": f"{conversation_id}.mp3", "audio_media_type": "audio/mpeg",
                                  "duration_ms": 1, "created_at": datetime.now(timezone.utc).isoformat()})
        samples._index_path().write_text(json.dumps({meeting: conversation_id}))
        return conversation_id

    def counts(self) -> dict[str, int]:
        with storage.connect() as conn:
            return {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    for table in ("collections", "notebooks", "pages", "todo_items", "suggestions", "categories", "sample_items")}

    def test_the_workspace_is_seeded_once_with_every_feature_and_no_key(self) -> None:
        conversation_id = self.add_meeting()
        for _ in range(2):  # The second pass is a second click: it adds nothing.
            samples.seed_workspace()
            samples._seed_meetings()
            counts = self.counts()
        self.assertEqual((counts["collections"], counts["notebooks"], counts["pages"]), (2, 4, 6))
        books = {book["name"]: book for book in notebooks.list_notebooks()}
        self.assertEqual(sorted(book["collection_id"] is None for book in books.values()), [False, False, False, True])
        self.assertTrue(books["Product design"]["todo_enabled"])
        self.assertEqual(books["Product design"]["conversations"][0]["id"], conversation_id)
        titles = {page["title"]: page for page in pages.list_pages()}
        self.assertIsNone(titles["To-dos"]["notebook_id"])
        markdown = "\n".join(pages.get(page["id"])["markdown"] for page in titles.values())
        for dialect in ("> [!", "<details>", "<bookmark url=", "![", "youtube.com/watch?v=", "| --- |", "https://upload.wikimedia.org"):
            self.assertIn(dialect, markdown)
        self.assertTrue(all(titles[name]["category_ids"] for name in ("Quarterly planning", "Remote control design brief")))
        self.assertTrue(library.assignments(conversation_id)[conversation_id])
        for status in ("open", "done", "canceled"):
            self.assertTrue(todos.gather("all", status)["groups"], status)
        self.assertTrue(any(item["due_date"] for group in todos.gather("all", "open")["groups"] for item in group["items"]))
        pending = suggestions.list_pending("conversation", conversation_id)
        self.assertEqual(sorted(item["operation"] for item in pending), ["add_todo", "set_todo_status"])
        for item in pending:
            self.assertEqual(item["author"], "transcript-agent")
            self.assertTrue(item["evidence"][0]["quote"])

    def test_removal_deletes_only_what_the_sample_created(self) -> None:
        from stellis.server import app
        mine = {"collection": collections.create("Work")["id"], "notebook": notebooks.create("Ideas")["id"],
                "page": pages.create("My page", None, "- [ ] Mine")["id"]}
        conversation_id = self.add_meeting()
        samples.seed_workspace()
        samples._seed_meetings()
        client = TestClient(app)
        self.assertTrue(client.get("/api/v1/samples").json()["installed"])
        status = client.delete("/api/v1/samples").json()
        client.close()
        self.assertFalse(status["installed"])
        self.assertEqual(samples.added(), [])
        self.assertIsNone(storage.get_conversation(conversation_id, include_trashed=True))
        self.assertEqual([item["id"] for item in collections.list_collections()], [mine["collection"]])
        self.assertEqual([item["id"] for item in notebooks.list_notebooks()], [mine["notebook"]])
        self.assertEqual([item["id"] for item in pages.list_pages()], [mine["page"]])
        self.assertEqual(self.counts(), {"collections": 1, "notebooks": 1, "pages": 1, "todo_items": 1, "suggestions": 0,
                                         "categories": self.counts()["categories"], "sample_items": 0})
        samples.seed_workspace()  # It can be added again after removal.
        self.assertEqual(self.counts()["pages"], 7)  # Mine plus the six sample pages.

    def test_the_api_reports_and_starts_the_download(self) -> None:
        from stellis.server import app
        client = TestClient(app)
        self.assertEqual(client.get("/api/v1/samples").json()["total"], 3)
        with patch.object(samples, "install") as install:
            started = client.post("/api/v1/samples").json()
            samples._THREAD.join(5)
        self.assertEqual(started["state"], "downloading")
        install.assert_called_once()
        client.close()


if __name__ == "__main__":
    unittest.main()
