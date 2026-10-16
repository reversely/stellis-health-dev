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

    def test_native_token_times_form_words_without_invented_offsets(self) -> None:
        item = {"offsets": {"from": 1000, "to": 2000}, "text": " Space flight, now.", "tokens": [
            {"text": " Space", "offsets": {"from": 1050, "to": 1300}, "p": .9},
            {"text": " flight", "offsets": {"from": 1310, "to": 1620}, "p": .8},
            {"text": ",", "offsets": {"from": 1620, "to": 1660}, "p": .7},
            {"text": " now", "offsets": {"from": 1700, "to": 1900}, "p": .95},
            {"text": ".", "offsets": {"from": 1900, "to": 1950}, "p": .9},
        ]}
        words = processing._measured_words(item)
        self.assertEqual([(word["text"], word["start_ms"], word["end_ms"]) for word in words],
                         [("Space", 1050, 1300), ("flight,", 1310, 1660), ("now.", 1700, 1950)])
        self.assertEqual([(word["start_offset"], word["end_offset"]) for word in words],
                         [(0, 5), (6, 13), (14, 18)])
        self.assertEqual(words[1]["confidence"], .7)
        item["text"] = "Different words."
        self.assertEqual(processing._measured_words(item), [])

    def test_word_alignment_reuses_timing_without_rewriting_edited_source(self) -> None:
        stamp = processing.now()
        source = [
            {"id":"old-1", "start_ms":0, "end_ms":1000, "text":"Hello there",
             "speaker_cluster_id":"speaker-1", "speaker_uncertain":False, "words":[]},
            {"id":"old-2", "start_ms":1000, "end_ms":2000, "text":"Again now",
             "speaker_cluster_id":"speaker-2", "speaker_uncertain":False, "words":[]},
        ]
        storage.save_transcript({"conversation_id":self.conversation_id, "revision":1,
                                 "pipeline_version":"source-v1", "language":"en",
                                 "segments_json":json.dumps(source), "turns_json":"[]", "updated_at":stamp})
        revision = storage.edit_transcript_segment(self.conversation_id, "old-1", "Hello Avery", 1)
        storage.set_speaker_label(self.conversation_id, "segment", "old-1", "Avery", revision)
        measured = [{**source[0], "id":"new-1", "words":[
            {"text":"Hello", "start_ms":100, "end_ms":350, "confidence":.9},
            {"text":"there", "start_ms":400, "end_ms":850, "confidence":.8}]},
                    {**source[1], "id":"new-2", "words":[
            {"text":"Again", "start_ms":1100, "end_ms":1400, "confidence":.85},
            {"text":"now", "start_ms":1500, "end_ms":1850, "confidence":.9}]}]
        storage.save_transcript({"conversation_id":self.conversation_id, "revision":1,
                                 "pipeline_version":"timed-v1", "language":"en",
                                 "segments_json":json.dumps(measured), "turns_json":"[]", "updated_at":stamp})
        with patch.object(processing._QUEUE, "put"):
            response = self.client.post(f"/api/v1/conversations/{self.conversation_id}/word-alignment",
                                        json={"source_generation_version":"source-v1"})
            self.assertEqual(response.status_code, 200)
            job = response.json()
            self.assertEqual(processing.request_word_alignment(self.conversation_id, "source-v1")["id"], job["id"])
        processing.run_job(str(job["id"]))
        result = self.client.get(f"/api/v1/conversations/{self.conversation_id}/transcript").json()
        self.assertEqual(self.client.get(f"/api/v1/jobs/{job['id']}").json()["state"], "succeeded")
        self.assertEqual([item["id"] for item in result["segments"]], ["old-1", "old-2"])
        self.assertEqual(result["segments"][0]["text"], "Hello Avery")
        self.assertEqual(result["segments"][0]["speaker_display_name"], "Avery")
        self.assertEqual(result["segments"][0]["words"], [])
        self.assertEqual([word["text"] for word in result["segments"][1]["words"]], ["Again", "now"])

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
