"""Sample meetings are added from the app, pinned by SHA-256 and filed under Meetings (#224)."""

from __future__ import annotations

import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import library, samples, storage


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
