"""Source-backed AI run behavior without paid provider calls."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from stellis import ai, storage
from stellis.server import app
from test_import import wav_bytes


class AIWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)
        imported = self.client.post("/api/v1/conversations/import", files={"file": ("talk.wav", wav_bytes(), "audio/wav")})
        self.conversation_id = imported.json()["conversation"]["id"]
        self.base = f"/api/v1/conversations/{self.conversation_id}"
        segments = [{"id": "seg-1", "start_ms": 0, "end_ms": 1500, "text": "Avery discussed satellites.",
                     "speaker_cluster_id": "speaker-1", "speaker_uncertain": False, "words": []},
                    {"id": "seg-2", "start_ms": 1500, "end_ms": 3000, "text": "They will send a draft tomorrow.",
                     "speaker_cluster_id": "speaker-1", "speaker_uncertain": False, "words": []}]
        storage.save_transcript({"conversation_id": self.conversation_id, "revision": 1,
                                 "language": "en", "segments_json": json.dumps(segments),
                                 "turns_json": "[]", "updated_at": datetime.now(timezone.utc).isoformat()})

    def tearDown(self) -> None:
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def _create(self, kind: str, question: str | None = None) -> dict[str, object]:
        with patch.object(ai, "_key", return_value="test-key"), patch.object(ai, "_launch"):
            response = self.client.post(f"{self.base}/ai-runs", json={"kind":kind,"question":question})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_summary_persists_valid_citations_and_becomes_stale_after_edit(self) -> None:
        run = self._create("summary")
        payload = {"overview":[{"text":"Avery discussed satellites.","source_segment_ids":["s1"]}],
                   "topics":[{"text":"Satellites","source_segment_ids":["s1"]}],
                   "decisions":[],"action_items":[]}
        with patch.object(ai, "_key", return_value="test-key"), patch.object(ai, "_request", return_value=payload):
            ai._run(run["id"])
        finished = self.client.get(f"/api/v1/ai-runs/{run['id']}").json()
        self.assertEqual(finished["state"], "succeeded")
        self.assertEqual(finished["model_id"], ai.MODEL_ID)
        self.assertEqual(finished["prompt_version"], ai.PROMPT_VERSION)
        self.assertEqual(finished["result"]["overview"][0]["source_segment_ids"], ["seg-1"])
        self.client.patch(f"{self.base}/transcript/segments/seg-1",
                          json={"text":"Avery discussed rockets.", "expected_revision":1})
        self.assertTrue(self.client.get(f"/api/v1/ai-runs/{run['id']}").json()["stale"])

    def test_summary_regeneration_creates_new_run_without_duplicate_active_request(self) -> None:
        first = self._create("summary")
        storage.update_ai_run(first['id'], state='succeeded', stage='complete')
        with patch.object(ai, '_key', return_value='test-key'), patch.object(ai, '_launch'):
            second = self.client.post(f'{self.base}/ai-runs', json={'kind':'summary','force':True}).json()
            repeated = self.client.post(f'{self.base}/ai-runs', json={'kind':'summary','force':True}).json()
        self.assertNotEqual(second['id'], first['id'])
        self.assertEqual(repeated['id'], second['id'])
        self.assertEqual(second['source_revision'], first['source_revision'])

    def test_shared_person_changes_stale_only_affected_conversation_runs(self) -> None:
        other_audio = bytearray(wav_bytes())
        other_audio[-1] = 1
        imported = self.client.post('/api/v1/conversations/import',
                                    files={'file': ('other.wav', bytes(other_audio), 'audio/wav')})
        other_id = imported.json()['conversation']['id']
        storage.save_transcript({'conversation_id': other_id, 'revision': 1, 'language': 'en',
                                 'segments_json': json.dumps([{'id':'other-seg', 'start_ms':0, 'end_ms':1000,
                                     'text':'A second recording.', 'speaker_cluster_id':'speaker-2',
                                     'speaker_uncertain':False, 'words':[]}]),
                                 'turns_json':'[]', 'updated_at':datetime.now(timezone.utc).isoformat()})
        a = self.client.post('/api/v1/persons', json={'name':'Avery'}).json()['id']
        b = self.client.post('/api/v1/persons', json={'name':'Blair'}).json()['id']
        for cid, segment in [(self.conversation_id, 'seg-1'), (other_id, 'other-seg')]:
            response = self.client.put(f'/api/v1/conversations/{cid}/person-links', json={
                'person_id':a, 'segment_id':segment, 'scope':'segment', 'expected_revision':1})
            self.assertEqual(response.status_code, 200)
        first = self._create('summary')
        with patch.object(ai, '_key', return_value='test-key'), patch.object(ai, '_launch'):
            second = self.client.post(f'/api/v1/conversations/{other_id}/ai-runs',
                                      json={'kind':'summary'}).json()
        self.assertFalse(first['stale'])
        self.assertFalse(second['stale'])
        self.client.patch(f'/api/v1/persons/{a}', json={'name':'Avery Renamed'})
        for run in (first, second):
            self.assertTrue(self.client.get(f"/api/v1/ai-runs/{run['id']}").json()['stale'])
        fresh_first = self._create('summary')
        self.assertNotEqual(fresh_first['id'], first['id'])
        self.assertFalse(fresh_first['stale'])
        with patch.object(ai, '_key', return_value='test-key'), patch.object(ai, '_launch'):
            fresh_second = self.client.post(f'/api/v1/conversations/{other_id}/ai-runs',
                                            json={'kind':'summary'}).json()
        self.assertFalse(fresh_second['stale'])
        self.client.put(f'{self.base}/person-links', json={
            'person_id':b, 'segment_id':'seg-1', 'scope':'segment', 'expected_revision':1})
        fresh_b = self._create('summary')
        self.assertFalse(fresh_b['stale'])
        self.client.post(f'/api/v1/persons/{a}/merge', json={'source_id':b})
        self.assertTrue(self.client.get(f"/api/v1/ai-runs/{fresh_b['id']}").json()['stale'])
        self.assertFalse(self.client.get(f"/api/v1/ai-runs/{fresh_second['id']}").json()['stale'])
        unlinked = self.client.post(f'/api/v1/conversations/{other_id}/person-links/remove', json={
            'segment_id':'other-seg', 'scope':'segment', 'expected_revision':1})
        self.assertEqual(unlinked.status_code, 200)
        self.assertTrue(self.client.get(f"/api/v1/ai-runs/{fresh_second['id']}").json()['stale'])

    def test_older_citation_keeps_audio_time_after_generation_changes(self) -> None:
        run = self._create('summary')
        result = {'overview':[{'text':'Earlier claim', 'source_segment_ids':['seg-2']}],
                  'topics':[], 'decisions':[], 'action_items':[]}
        storage.update_ai_run(run['id'], state='succeeded', stage='complete', result_json=json.dumps(result))
        with storage.connect() as conn:
            conn.execute("UPDATE ai_runs SET source_segments_json = '{}' WHERE id = ?", (run['id'],))
        replacement = [{'id':'new-seg', 'start_ms':0, 'end_ms':3000, 'text':'New wording.',
                        'speaker_cluster_id':'speaker-1', 'speaker_uncertain':False, 'words':[]}]
        storage.save_transcript({'conversation_id':self.conversation_id, 'pipeline_version':'replacement',
                                 'revision':2, 'language':'en', 'segments_json':json.dumps(replacement),
                                 'turns_json':'[]', 'updated_at':datetime.now(timezone.utc).isoformat()})
        old = self.client.get(f"/api/v1/ai-runs/{run['id']}").json()
        self.assertTrue(old['stale'])
        self.assertEqual(old['source_starts']['seg-2'], 1500)

    def test_invented_source_ids_fail_even_after_one_repair(self) -> None:
        run = self._create("summary")
        bad = {"overview":[{"text":"Unsupported","source_segment_ids":["invented"]}],
               "topics":[],"decisions":[],"action_items":[]}
        with patch.object(ai, "_request", return_value=bad) as provider:
            ai._run(run["id"])
        self.assertEqual(provider.call_count, 2)
        finished = self.client.get(f"/api/v1/ai-runs/{run['id']}").json()
        self.assertEqual(finished["state"], "failed")
        self.assertEqual(finished["error_code"], "invalid_source")
        self.assertIsNone(finished["result"])

    def test_answer_uses_evidence_or_marks_insufficient(self) -> None:
        run = self._create("answer", "What did Avery discuss?")
        payload = {"answer":"Satellites.","source_segment_ids":["s1"],"insufficient_evidence":False}
        with patch.object(ai, "_request", return_value=payload):
            ai._run(run["id"])
        result = self.client.get(f"/api/v1/ai-runs/{run['id']}").json()
        self.assertEqual(result["result"]["answer"], "Satellites.")
        self.assertEqual(result["result"]["source_segment_ids"], ["seg-1"])
        self.assertRaises(ai.AIError, ai._validate_answer,
                          {"answer":"A claim","source_segment_ids":[],"insufficient_evidence":False}, {"seg-1"})

    def test_small_transcript_uses_one_summary_chunk(self) -> None:
        segments = storage.get_display_transcript(self.conversation_id)["segments"]
        self.assertEqual([len(chunk) for chunk in ai._chunks(segments)], [2])
        self.assertEqual(ai._canonical_sources(["[s1]", "s1"], {"s1"}), ["s1"])
        self.assertEqual(ai._canonical_sources(["s1-s3"], {"s1", "s2", "s3"}), ["s1", "s2", "s3"])

    def test_provider_failures_have_public_codes_without_response_body(self) -> None:
        original_client = httpx.Client
        metadata = {"attempts": 0, "request_ids": [], "usage": {}}
        for status, code in [(429, "rate_limited"), (404, "model_unavailable"), (401, "authentication")]:
            transport = httpx.MockTransport(lambda request, status=status: httpx.Response(status, text="private provider body"))
            with self.subTest(status=status), patch.object(ai, "_key", return_value="test-key"), \
                 patch.object(ai.httpx, "Client", side_effect=lambda **kwargs: original_client(transport=transport)):
                with self.assertRaises(ai.AIError) as error:
                    ai._request([{"role": "user", "content": "test"}], 100, metadata, "summary")
                self.assertEqual(error.exception.code, code)
                self.assertNotIn("private provider body", str(error.exception))

        transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "not JSON"}}]}))
        with patch.object(ai, "_key", return_value="test-key"), \
             patch.object(ai.httpx, "Client", side_effect=lambda **kwargs: original_client(transport=transport)):
            with self.assertRaises(ai.AIError) as error:
                ai._request([{"role": "user", "content": "test"}], 100, metadata, "summary")
            self.assertEqual(error.exception.code, "invalid_json")

    def test_long_summary_keeps_one_overview_from_each_chunk(self) -> None:
        segments = storage.get_display_transcript(self.conversation_id)["segments"]
        original_limit = ai.MAX_CHUNK_CHARS
        ai.MAX_CHUNK_CHARS = 1
        try:
            chunks = ai._chunks(segments)
            self.assertEqual(len(chunks), 2)
            run = self._create("summary")
            calls = 0
            def respond(messages, allowed, max_tokens, metadata, *, kind, require_overview=False):
                nonlocal calls
                calls += 1
                label = "s1"
                return {"overview":[{"text":f"Part {calls}","source_segment_ids":[label]}],
                        "topics":[],"decisions":[],"action_items":[]}
            with patch.object(ai, "_complete", side_effect=respond):
                ai._run(run["id"])
            result = self.client.get(f"/api/v1/ai-runs/{run['id']}").json()["result"]
            self.assertEqual([item["text"] for item in result["overview"]], ["Part 1", "Part 2"])
        finally:
            ai.MAX_CHUNK_CHARS = original_limit


if __name__ == "__main__":
    unittest.main()
