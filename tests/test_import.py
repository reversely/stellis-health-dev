"""Browser-facing import and playback checks with generated audio."""

from __future__ import annotations

import io
import os
import struct
import tempfile
import unittest
import wave
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis.server import app


def wav_bytes() -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(struct.pack("<16000h", *([0] * 16000)))
    return output.getvalue()


class ImportWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_upload_replay_range_and_duplicate(self) -> None:
        self.assertEqual(self.client.get("/api/v1/health").json()["api_version"], "v1")
        content = wav_bytes()
        imported = self.client.post("/api/v1/conversations/import", files={"file": ("interview.wav", content, "audio/wav")})
        self.assertEqual(imported.status_code, 200)
        record = imported.json()["conversation"]
        self.assertFalse(imported.json()["duplicate"])
        self.assertEqual(record["duration_ms"], 1000)
        self.assertEqual(len(self.client.get("/api/v1/conversations").json()), 1)
        self.assertEqual(self.client.get(f"/api/v1/conversations/{record['id']}").json(), record)
        self.assertEqual(self.client.get(f"/conversation/{record['id']}").status_code, 200)
        audio = self.client.get(f"/api/v1/conversations/{record['id']}/audio", headers={"Range": "bytes=0-15"})
        self.assertEqual(audio.status_code, 206)
        self.assertEqual(audio.content, content[:16])
        self.assertEqual(audio.headers["content-range"], f"bytes 0-15/{len(content)}")
        again = self.client.post("/api/conversations/import", files={"file": ("renamed.wav", content, "audio/wav")})
        self.assertTrue(again.json()["duplicate"])
        self.assertEqual(again.json()["conversation"]["id"], record["id"])
        self.assertEqual(len(self.client.get("/api/conversations").json()), 1)
        self.assertEqual(Path(self.temp.name, "stellis.sqlite3").stat().st_mode & 0o777, 0o600)

    def test_otter_zip_chooses_audio(self) -> None:
        archive_bytes = io.BytesIO()
        with zipfile.ZipFile(archive_bytes, "w") as archive:
            archive.writestr("interview/audio.wav", wav_bytes())
            archive.writestr("interview/transcript.txt", "A private transcript")
        imported = self.client.post("/api/conversations/import", files={"file": ("export.zip", archive_bytes.getvalue(), "application/zip")})
        self.assertEqual(imported.status_code, 200)
        self.assertEqual(imported.json()["conversation"]["title"], "audio")
        self.assertNotIn("transcript", str(imported.json()))

    def test_invalid_files_are_rejected_without_records(self) -> None:
        for name, content in [("empty.wav", b""), ("bad.wav", b"not audio"), ("bad.zip", b"not zip")]:
            with self.subTest(name=name):
                response = self.client.post("/api/conversations/import", files={"file": (name, content)})
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/conversations").json(), [])


if __name__ == "__main__":
    unittest.main()
