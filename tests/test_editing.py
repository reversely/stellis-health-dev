"""Browser API checks for reversible text, speaker, and vocabulary corrections."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import processing, storage
from stellis.server import app
from test_import import wav_bytes


class EditingWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)
        imported = self.client.post("/api/v1/conversations/import", files={"file": ("talk.wav", wav_bytes(), "audio/wav")})
        self.conversation_id = imported.json()["conversation"]["id"]
        self.base = f"/api/v1/conversations/{self.conversation_id}"
        stamp = datetime.now(timezone.utc).isoformat()
        segments = [
            {"id": "segment-1", "start_ms": 0, "end_ms": 500, "text": "Asteriod launch.",
             "speaker_cluster_id": "speaker-1", "speaker_uncertain": False, "provenance": "on_device_asr",
             "words": [{"text":"Asteriod", "start_offset":0, "end_offset":8, "start_ms":0, "end_ms":300,
                        "confidence":.8, "provenance":"whisper_cpp_token_v1"}]},
            {"id": "segment-2", "start_ms": 500, "end_ms": 1000, "text": "It was ready.",
             "speaker_cluster_id": "speaker-1", "speaker_uncertain": False, "provenance": "on_device_asr", "words": []},
        ]
        storage.save_transcript({"conversation_id": self.conversation_id, "revision": 1,
                                 "language": "en", "segments_json": json.dumps(segments),
                                 "turns_json": json.dumps([]), "updated_at": stamp})

    def tearDown(self) -> None:
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_word_edit_history_conflict_and_restore(self) -> None:
        endpoint = f"{self.base}/transcript/segments/segment-1"
        changed = self.client.patch(endpoint, json={"text": "Asteroid launch.", "expected_revision": 1})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["revision"], 2)
        result = self.client.get(f"{self.base}/transcript").json()
        self.assertEqual(result["segments"][0]["text"], "Asteroid launch.")
        self.assertEqual(result["segments"][0]["original_text"], "Asteriod launch.")
        self.assertEqual(result["segments"][0]["text_provenance"], "user_edit")
        self.assertEqual(result["segments"][0]["words"], [])
        conflict = self.client.patch(endpoint, json={"text": "wrong", "expected_revision": 1})
        self.assertEqual(conflict.status_code, 409)
        restored = self.client.patch(endpoint, json={"text": "Asteriod launch.", "expected_revision": 2})
        self.assertEqual(restored.json()["revision"], 3)
        self.assertNotIn("original_text", self.client.get(f"{self.base}/transcript").json()["segments"][0])
        self.assertEqual(len(self.client.get(f"{self.base}/transcript").json()["segments"][0]["words"]), 1)
        with storage.connect() as conn:
            events = conn.execute("SELECT old_text, new_text FROM transcript_edit_events ORDER BY revision").fetchall()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["old_text"], "Asteriod launch.")
        self.assertEqual(events[1]["new_text"], "Asteriod launch.")

    def test_batch_word_edits_are_atomic_and_keep_source_text(self) -> None:
        endpoint = f"{self.base}/transcript/segments"
        changed = self.client.patch(endpoint, json={"expected_revision": 1, "edits": [
            {"segment_id": "segment-1", "text": "Asteroid launch."},
            {"segment_id": "segment-2", "text": "It was ready to go."},
        ]})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["revision"], 2)
        result = self.client.get(f"{self.base}/transcript").json()
        self.assertEqual([item["text"] for item in result["segments"]], ["Asteroid launch.", "It was ready to go."])
        self.assertEqual([item["original_text"] for item in result["segments"]], ["Asteriod launch.", "It was ready."])
        with storage.connect() as conn:
            events = conn.execute("SELECT revision FROM transcript_edit_events").fetchall()
        self.assertEqual([item["revision"] for item in events], [2, 2])
        conflict = self.client.patch(endpoint, json={"expected_revision": 1, "edits": [
            {"segment_id": "segment-1", "text": "Uncommitted"}]})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(self.client.get(f"{self.base}/transcript").json()["segments"][0]["text"], "Asteroid launch.")
        invalid = self.client.patch(endpoint, json={"expected_revision": 2, "edits": [
            {"segment_id": "segment-1", "text": "Another edit"},
            {"segment_id": "missing", "text": "No source"}]})
        self.assertEqual(invalid.status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/transcript").json()["revision"], 2)

    def test_cluster_label_and_segment_override_are_reversible(self) -> None:
        endpoint = f"{self.base}/speakers/label"
        cluster = self.client.put(endpoint, json={"scope":"cluster","target_id":"speaker-1","name":"Ari","expected_revision":1})
        self.assertEqual(cluster.json()["revision"], 2)
        labels = [item["speaker_display_name"] for item in self.client.get(f"{self.base}/transcript").json()["segments"]]
        self.assertEqual(labels, ["Ari", "Ari"])
        single = self.client.put(endpoint, json={"scope":"segment","target_id":"segment-2","name":"Sam","expected_revision":2})
        self.assertEqual(single.json()["revision"], 3)
        result = self.client.get(f"{self.base}/transcript").json()
        self.assertEqual([item["speaker_display_name"] for item in result["segments"]], ["Ari", "Sam"])
        self.assertEqual(result["segments"][1]["speaker_cluster_id"], "speaker-1")
        cleared = self.client.put(endpoint, json={"scope":"segment","target_id":"segment-2","name":None,"expected_revision":3})
        self.assertEqual(cleared.json()["revision"], 4)
        labels = [item["speaker_display_name"] for item in self.client.get(f"{self.base}/transcript").json()["segments"]]
        self.assertEqual(labels, ["Ari", "Ari"])

    def test_vocabulary_changes_only_future_job_snapshot(self) -> None:
        existing = processing.request_processing(self.conversation_id)
        first = self.client.post("/api/v1/vocabulary", json={"term":"CIFAR"})
        self.assertEqual(first.status_code, 200)
        term = first.json()
        self.assertEqual(self.client.get("/api/v1/vocabulary").json()[0]["term"], "CIFAR")
        self.assertEqual(self.client.get(f"{self.base}/transcript").json()["revision"], 1)
        later = processing.request_processing(self.conversation_id)
        self.assertNotEqual(later["id"], existing["id"])
        self.assertEqual(json.loads(later["vocabulary_json"]), ["CIFAR"])
        self.assertEqual(self.client.get(f"{self.base}/processing-job").json()["id"], later["id"])
        renamed = self.client.patch(f"/api/v1/vocabulary/{term['id']}", json={"term":"CIFAR Alliance"})
        self.assertEqual(renamed.json()["term"], "CIFAR Alliance")
        self.assertEqual(self.client.delete(f"/api/v1/vocabulary/{term['id']}").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/vocabulary").json(), [])

    def test_reprocessing_retains_prior_machine_generation(self) -> None:
        original = self.client.get(f"{self.base}/transcript").json()
        version = original["generation_version"]
        new_segments = [{**original["segments"][0], "text": "Asteroid launch.",
                         "id": "new-segment"}]
        storage.save_transcript({"conversation_id": self.conversation_id, "revision": 1,
                                 "pipeline_version": "new-model-with-vocabulary", "language": "en",
                                 "segments_json": json.dumps(new_segments), "turns_json": json.dumps([]),
                                 "updated_at": datetime.now(timezone.utc).isoformat()})
        active = self.client.get(f"{self.base}/transcript").json()
        self.assertEqual(active["revision"], 2)
        self.assertEqual(active["generation_version"], "new-model-with-vocabulary")
        generations = self.client.get(f"{self.base}/transcript/generations").json()
        self.assertEqual(len(generations), 2)
        prior = self.client.get(f"{self.base}/transcript/generations/{version}").json()
        self.assertEqual(prior["segments"][0]["text"], "Asteriod launch.")

    def test_selected_highlight_persists_and_can_be_removed(self) -> None:
        endpoint = f"{self.base}/highlights"
        created = self.client.post(endpoint, json={"segment_id":"segment-1", "start_offset":0,
                                                   "end_offset":8, "expected_revision":1})
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["quote"], "Asteriod")
        self.assertEqual(len(self.client.get(f"{self.base}/transcript").json()["highlights"]), 1)
        invalid = self.client.post(endpoint, json={"segment_id":"segment-1", "start_offset":0,
                                                   "end_offset":500, "expected_revision":1})
        self.assertEqual(invalid.status_code, 400)
        changed = self.client.patch(f"{self.base}/transcript/segments/segment-1",
                                    json={"text":"Asteroid launch.", "expected_revision":1})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.client.get(f"{self.base}/transcript").json()["highlights"][0]["quote"], "Asteriod")
        removed = self.client.delete(f"{endpoint}/{created.json()['id']}")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self.client.get(f"{self.base}/transcript").json()["highlights"], [])

    def test_search_uses_current_edits_labels_and_multiple_conversations(self) -> None:
        first = self.client.get('/api/v1/search', params={'q': 'Asteriod'}).json()
        self.assertEqual(first['total'], 1)
        self.assertEqual(first['results'][0]['segment_id'], 'segment-1')
        self.client.patch(f'{self.base}/transcript/segments/segment-1',
                          json={'text': 'Asteroid launch.', 'expected_revision': 1})
        self.assertEqual(self.client.get('/api/v1/search', params={'q': 'Asteriod'}).json()['total'], 0)
        self.assertEqual(self.client.get('/api/v1/search', params={'q': 'Asteroid'}).json()['results'][0]['revision'], 2)
        self.client.put(f'{self.base}/speakers/label', json={
            'scope': 'cluster', 'target_id': 'speaker-1', 'name': 'Ari', 'expected_revision': 2})
        speaker = self.client.get('/api/v1/search', params={'q': 'Ari'}).json()
        self.assertEqual([(item['kind'], item['speaker']) for item in speaker['results']], [('speaker', 'Ari')])
        self.assertEqual(speaker['results'][0]['revision'], 3)
        second_audio = wav_bytes()[:-2] + b'\x01\x00'
        imported = self.client.post('/api/v1/conversations/import',
                                    files={'file': ('second.wav', second_audio, 'audio/wav')})
        second_id = imported.json()['conversation']['id']
        stamp = datetime.now(timezone.utc).isoformat()
        storage.save_transcript({'conversation_id': second_id, 'revision': 1, 'language': 'en',
                                 'segments_json': json.dumps([{'id': 'second-segment', 'start_ms': 0,
                                     'end_ms': 500, 'text': 'Asteroid ready.', 'speaker_cluster_id': None,
                                     'speaker_uncertain': True, 'words': []}]),
                                 'turns_json': '[]', 'updated_at': stamp})
        results = self.client.get('/api/v1/search', params={'q': 'Asteroid'}).json()['results']
        self.assertEqual({item['conversation_id'] for item in results}, {self.conversation_id, second_id})
        self.assertTrue(next(item for item in results if item['conversation_id'] == second_id)['speaker_uncertain'])
        replacement = [{'id': 'second-new', 'start_ms': 0, 'end_ms': 500,
                        'text': 'Orbit ready.', 'speaker_cluster_id': None,
                        'speaker_uncertain': True, 'words': []}]
        storage.save_transcript({'conversation_id': second_id, 'revision': 1,
                                 'pipeline_version': 'replacement-generation', 'language': 'en',
                                 'segments_json': json.dumps(replacement), 'turns_json': '[]',
                                 'updated_at': stamp})
        refreshed = self.client.get('/api/v1/search', params={'q': 'Asteroid'}).json()['results']
        self.assertEqual({item['conversation_id'] for item in refreshed}, {self.conversation_id})
        self.assertEqual(self.client.get('/api/v1/search', params={'q': 'Orbit'}).json()['results'][0]['segment_id'],
                         'second-new')


if __name__ == "__main__":
    unittest.main()
