"""Recoverable browser recording API checks using real encoded WebM audio."""

from __future__ import annotations

from stellis import tools
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis.server import app


class RecordingWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def _webm(self) -> bytes:
        path = Path(self.temp.name) / "sample.webm"
        subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                        "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", str(path)],
                       check=True, timeout=20)
        return path.read_bytes()

    def test_interrupted_chunks_are_recoverable_and_imported(self) -> None:
        session = self.client.post("/api/v1/recordings", json={"title":"Mic check", "media_type":"audio/webm"}).json()
        data = self._webm()
        midpoint = len(data) // 2
        for sequence, chunk in enumerate((data[:midpoint], data[midpoint:])):
            saved = self.client.put(f"/api/v1/recordings/{session['id']}/chunks/{sequence}", content=chunk)
            self.assertEqual(saved.status_code, 200)
        duplicate = self.client.put(f"/api/v1/recordings/{session['id']}/chunks/0", content=data[:midpoint])
        self.assertTrue(duplicate.json()["duplicate"])
        conflict = self.client.put(f"/api/v1/recordings/{session['id']}/chunks/0", content=b"different")
        self.assertEqual(conflict.status_code, 409)
        pause = self.client.post(f"/api/v1/recordings/{session['id']}/events",
                                 json={"kind":"pause", "media_position_ms":500})
        self.assertEqual(pause.status_code, 200)
        renamed = self.client.patch(f"/api/v1/recordings/{session['id']}", json={"title":"Interview mic check"})
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.json()["title"], "Interview mic check")
        unfinished = self.client.get("/api/v1/recordings").json()
        self.assertEqual(unfinished[0]["chunk_count"], 2)
        self.assertEqual(unfinished[0]["title"], "Interview mic check")
        with patch("stellis.server.processing.capabilities", return_value={"features": {"transcribe": True, "diarize": True}}), \
             patch("stellis.server.processing.request_processing") as start_speech:
            recovered = self.client.post(f"/api/v1/recordings/{session['id']}/finalize")
        self.assertEqual(recovered.status_code, 200)
        conversation = recovered.json()["conversation"]
        start_speech.assert_called_once_with(conversation["id"])
        self.assertEqual(conversation["title"], "Interview mic check")
        self.assertGreater(conversation["duration_ms"], 1000)
        audio = self.client.get(f"/api/v1/conversations/{conversation['id']}/audio")
        self.assertEqual(audio.status_code, 200)
        self.assertEqual(audio.headers["content-type"], "audio/webm")
        self.assertGreater(len(audio.content), 1000)
        self.assertEqual(self.client.get("/api/v1/recordings").json(), [])
        self.assertEqual(self.client.post(f"/api/v1/recordings/{session['id']}/finalize").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/recordings/{session['id']}", json={"title":"Later"}).status_code, 409)

    def test_empty_or_gapped_recording_remains_recoverable(self) -> None:
        session = self.client.post("/api/v1/recordings", json={"title":"Gap", "media_type":"audio/webm"}).json()
        endpoint = f"/api/v1/recordings/{session['id']}"
        self.assertEqual(self.client.post(f"{endpoint}/finalize").status_code, 400)
        self.assertEqual(self.client.put(f"{endpoint}/chunks/1", content=b"partial").status_code, 200)
        self.assertEqual(self.client.post(f"{endpoint}/finalize").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/recordings").json()[0]["chunk_count"], 1)
        self.assertEqual(self.client.delete(endpoint).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/recordings").json(), [])


if __name__ == "__main__":
    unittest.main()
