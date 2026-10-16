"""Provisional recording ASR stays bounded to saved media time."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import recording_preview
from stellis.server import app


class RecordingPreviewTest(unittest.TestCase):
    def test_preview_clamps_model_padding_and_survives_readback(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"STELLIS_DATA_DIR": directory}):
            client = TestClient(app)
            session = client.post("/api/v1/recordings", json={"title": "Preview", "media_type": "audio/webm"}).json()
            path = Path(directory) / "sample.webm"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                            "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", str(path)],
                           check=True, timeout=20)
            data = path.read_bytes()
            step = (len(data) + 4) // 5
            chunks = [data[index:index + step] for index in range(0, len(data), step)]
            for sequence, chunk in enumerate(chunks):
                response = client.put(f"/api/v1/recordings/{session['id']}/chunks/{sequence}", content=chunk)
                self.assertEqual(response.status_code, 200)
            model = Path(directory) / "model.bin"
            model.write_bytes(b"model fixture")
            native_run = subprocess.run

            def run(command, *args, **kwargs):
                if command[0] == "whisper-cli":
                    output = Path(command[command.index("-of") + 1]).with_suffix(".json")
                    output.write_text(json.dumps({"transcription": [
                        {"offsets": {"from": 0, "to": 30000}, "text": "spoken sample"},
                    ]}))
                    return subprocess.CompletedProcess(command, 0)
                return native_run(command, *args, **kwargs)

            with patch.object(recording_preview.processing, "model_paths", return_value=(model, model, model)), \
                 patch.object(recording_preview.shutil, "which", return_value="/bin/true"), \
                 patch.object(recording_preview.subprocess, "run", side_effect=run):
                response = client.post(f"/api/v1/recordings/{session['id']}/preview")
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result["segments"][0]["text"], "spoken sample")
            self.assertLessEqual(result["segments"][0]["end_ms"], 2100)
            self.assertEqual(client.get(f"/api/v1/recordings/{session['id']}/preview").json(), result)
            self.assertEqual(client.post(f"/api/v1/recordings/{session['id']}/finalize").status_code, 200)
            self.assertFalse((Path(directory) / "recordings" / session["id"] / "preview.json").exists())
            client.close()


if __name__ == "__main__":
    unittest.main()
