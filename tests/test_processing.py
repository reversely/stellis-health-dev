"""Durable speech-job behavior without downloading native model binaries."""

from __future__ import annotations

import os
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import processing, storage
from stellis.server import app
from test_import import wav_bytes


class ProcessingWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)
        response = self.client.post("/api/v1/conversations/import", files={"file": ("talk.wav", wav_bytes(), "audio/wav")})
        self.conversation_id = response.json()["conversation"]["id"]

    def tearDown(self) -> None:
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_persisted_job_and_transcript(self) -> None:
        model = Path(self.temp.name, "model.bin")
        model.write_bytes(b"model")
        job = processing.request_processing(self.conversation_id)
        again = processing.request_processing(self.conversation_id)
        self.assertEqual(job["id"], again["id"])
        segments = [{"start_ms": 100, "end_ms": 900, "text": "A test sentence."}]
        turns = [{"start_ms": 100, "end_ms": 900, "speaker_cluster_id": "speaker-1"}]
        with patch.object(processing, "model_paths", return_value=(model, model, model)), \
             patch.object(processing, "_command"), \
             patch.object(processing, "_transcribe", return_value=segments), \
             patch.object(processing, "_diarize", return_value=turns):
            processing.run_job(str(job["id"]))
        result = self.client.get(f"/api/v1/jobs/{job['id']}").json()
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(result["metrics"]["cluster_count"], 1)
        transcript = self.client.get(f"/api/v1/conversations/{self.conversation_id}/transcript").json()
        self.assertEqual(transcript["segments"][0]["provenance"], "on_device_asr")
        self.assertEqual(transcript["segments"][0]["speaker_cluster_id"], "speaker-1")
        self.assertTrue(transcript["segments"][0]["speaker_uncertain"])
        self.assertEqual(storage.get_transcript(self.conversation_id)["revision"], 1)
        processing.run_job(str(job["id"]))
        self.assertEqual(self.client.get(f"/api/v1/jobs/{job['id']}").json()["state"], "succeeded")

    def test_alignment_marks_ambiguous_turn(self) -> None:
        segments = [{"start_ms": 0, "end_ms": 3000, "text": "We talked over each other."}]
        turns = [
            {"start_ms": 0, "end_ms": 1500, "speaker_cluster_id": "speaker-1"},
            {"start_ms": 1500, "end_ms": 3000, "speaker_cluster_id": "speaker-2"},
        ]
        result, fraction = processing.align_segments(self.conversation_id, segments, turns)
        self.assertTrue(result[0]["speaker_uncertain"])
        self.assertEqual(fraction, 0)

    def test_vocabulary_reaches_whisper_initial_prompt(self) -> None:
        output = Path(self.temp.name, "transcript")
        observed: list[str] = []

        def native_command(command: list[str], timeout: int) -> None:
            observed.extend(command)
            output.with_suffix(".json").write_text(json.dumps({"transcription": [
                {"offsets": {"from": 0, "to": 1000}, "text": "CIFAR"}
            ]}))

        with patch.object(processing, "_command", side_effect=native_command):
            result = processing._transcribe(Path("/audio.wav"), Path("/model.bin"), output, ["CIFAR"])
        self.assertEqual(result[0]["text"], "CIFAR")
        self.assertIn("--prompt", observed)
        self.assertIn("Vocabulary: CIFAR", observed)

    def test_failed_job_can_be_requeued_without_losing_audio(self) -> None:
        job = processing.request_processing(self.conversation_id)
        environment = {**os.environ,
                       "STELLIS_WHISPER_MODEL": "/missing-asr",
                       "STELLIS_SEGMENTATION_MODEL": "/missing-seg",
                       "STELLIS_EMBEDDING_MODEL": "/missing-embed"}
        completed = subprocess.run([sys.executable, "-m", "stellis.worker", str(job["id"])],
                                   env=environment, capture_output=True, timeout=10)
        self.assertEqual(completed.returncode, 0)
        failed = storage.get_job(str(job["id"]))
        self.assertEqual(failed["state"], "failed")
        retried = processing.request_processing(self.conversation_id)
        self.assertEqual(retried["id"], job["id"])
        self.assertEqual(retried["state"], "queued")
        media = storage.data_dir() / "media" / f"{self.conversation_id}.wav"
        self.assertTrue(media.is_file())


if __name__ == "__main__":
    unittest.main()
