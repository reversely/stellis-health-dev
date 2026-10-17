"""Speech models download on first run, checked by SHA-256, and waiting recordings then transcribe."""

from __future__ import annotations

import hashlib
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from stellis import models, processing, storage


class ModelDownloadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.payload = b"model bytes"
        digest = hashlib.sha256(self.payload).hexdigest()
        self.catalog = patch.object(models, "MODELS", (("tiny.bin", "https://example.invalid/tiny.bin", digest, None),))
        self.catalog.start()

    def tearDown(self) -> None:
        self.catalog.stop()
        self.env.stop()
        self.temp.cleanup()
        models._STATE.update(state="idle", model=None, progress=0.0, error=None)

    def _fetch(self, payload: bytes):
        def fetch(url: str, target: Path, index: int, count: int) -> None:
            target.write_bytes(payload)
        return patch.object(models, "_fetch", side_effect=fetch)

    def test_a_verified_download_is_installed_owner_only(self) -> None:
        self.assertEqual(models.missing(), ["tiny.bin"])
        with self._fetch(self.payload):
            models.install()
        installed = models.directory() / "tiny.bin"
        self.assertEqual(installed.read_bytes(), self.payload)
        self.assertEqual(stat.S_IMODE(installed.stat().st_mode), 0o600)
        self.assertEqual(models.status()["state"], "ready")
        self.assertEqual(models.missing(), [])

    def test_a_download_that_fails_its_checksum_is_not_installed(self) -> None:
        with self._fetch(b"tampered"):
            models.install()
        self.assertFalse((models.directory() / "tiny.bin").exists())
        state = models.status()
        self.assertEqual(state["state"], "failed")
        self.assertIn("checksum", state["error"])

    def test_recordings_imported_while_downloading_are_queued_afterwards(self) -> None:
        with storage.connect() as conn:
            conn.execute("INSERT INTO conversations (id, title, source_sha256, audio_filename, audio_media_type, "
                         "duration_ms, created_at) VALUES ('waiting', 'Waiting', 'hash', 'a.mp3', 'audio/mpeg', 1000, 'now')")
        with self._fetch(self.payload), patch.object(processing, "request_processing") as request:
            models.install()
        request.assert_called_once_with("waiting")


if __name__ == "__main__":
    unittest.main()
