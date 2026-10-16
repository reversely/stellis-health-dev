"""Live AI Chat uses a frozen local preview and survives recording finalization."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import ai, recording, recording_ai
from stellis.server import app


class RecordingChatWorkflowTest(unittest.TestCase):
    def test_preview_question_and_saved_source_time(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"STELLIS_DATA_DIR": directory}):
            client = TestClient(app)
            session = client.post("/api/v1/recordings", json={"title":"Live chat", "media_type":"audio/webm"}).json()
            base = f"/api/v1/recordings/{session['id']}"
            with patch.object(ai, "_key", return_value="test-key"):
                self.assertEqual(client.post(f"{base}/chat", json={"question":"What happened?"}).status_code, 409)
            preview = {"state":"ready", "through_sequence":2,
                       "segments":[{"start_ms":500,"end_ms":1200,"text":"Avery will send the draft."}]}
            (recording._directory(session["id"]) / "preview.json").write_text(json.dumps(preview))
            with patch.object(ai, "_key", return_value="test-key"), patch.object(recording_ai.threading, "Thread"):
                started = client.post(f"{base}/chat", json={"question":"What will Avery send?"}).json()
            payload = {"answer":"Avery will send the draft.","source_segment_ids":["s1"],
                       "insufficient_evidence":False}
            requests = []
            def respond(messages, max_tokens, metadata, kind):
                requests.append(messages)
                return payload
            with patch.object(ai, "_key", return_value="test-key"), patch.object(ai, "_request", side_effect=respond):
                recording_ai._run(started["id"])
            self.assertIn("provisional on-device speech recognition", requests[0][0]["content"])
            result = client.get(f"/api/v1/recording-chat/{started['id']}").json()
            self.assertEqual(result["state"], "succeeded")
            self.assertEqual(result["source_starts"][result["result"]["source_segment_ids"][0]], 500)

            media = Path(directory) / "sample.webm"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                            "-i", "sine=frequency=440:duration=2", "-c:a", "libopus", str(media)],
                           check=True, timeout=20)
            encoded = media.read_bytes()
            self.assertEqual(client.put(f"{base}/chunks/0", content=encoded).status_code, 200)
            finalized = client.post(f"{base}/finalize")
            self.assertEqual(finalized.status_code, 200, finalized.text)
            conversation_id = finalized.json()["conversation"]["id"]
            saved = client.get(f"/api/v1/conversations/{conversation_id}/recording-chat").json()
            self.assertEqual(saved[0]["result"]["answer"], "Avery will send the draft.")
            self.assertEqual(client.post(f"{base}/chat", json={"question":"Again?"}).status_code, 409)
            self.assertEqual(client.post(f"/api/v1/conversations/{conversation_id}/trash").status_code, 200)
            self.assertEqual(client.delete(f"/api/v1/trash/{conversation_id}").status_code, 200)
            self.assertEqual(client.get(f"/api/v1/recording-chat/{started['id']}").status_code, 404)
            client.close()


if __name__ == "__main__":
    unittest.main()
