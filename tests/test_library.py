"""Browser API checks for categories, Trash, and dependent data removal."""

import json
import os
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import library, storage
from stellis.server import app
from test_import import wav_bytes


class LibraryWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)
        self.audio = wav_bytes()
        self.first = self.client.post('/api/v1/conversations/import',
                                      files={'file': ('first.wav', self.audio, 'audio/wav')}).json()['conversation']['id']
        self.second_audio = self.audio[:-2] + b'\x01\x00'
        self.second = self.client.post('/api/v1/conversations/import',
                                       files={'file': ('second.wav', self.second_audio, 'audio/wav')}).json()['conversation']['id']
        now = datetime.now(timezone.utc).isoformat()
        storage.save_transcript({'conversation_id': self.first, 'revision': 1, 'language': 'en',
                                 'segments_json': json.dumps([{'id': 's1', 'start_ms': 0, 'end_ms': 500,
                                     'text': 'Asteroid launch.', 'speaker_cluster_id': 'speaker-1',
                                     'speaker_uncertain': False, 'words': []}]),
                                 'turns_json': '[]', 'updated_at': now})

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_categories_trash_restore_and_permanent_delete(self):
        categories = [self.client.post('/api/v1/categories', json={'name': name}).json()
                      for name in ('Research', 'Interviews')]
        for category in categories:
            response = self.client.put(f'/api/v1/conversations/{self.first}/categories/{category["id"]}')
            self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.client.get(f'/api/v1/conversations/{self.first}').json()['category_ids']), 2)
        duplicate = self.client.post('/api/v1/conversations/import',
                                     files={'file': ('same.wav', self.audio, 'audio/wav')}).json()
        self.assertTrue(duplicate['duplicate'])
        self.assertEqual(len(duplicate['conversation']['category_ids']), 2)
        self.assertEqual(self.client.get('/api/v1/search', params={'q':'Asteroid',
            'category_id': categories[0]['id']}).json()['total'], 1)
        self.assertEqual(self.client.get('/api/v1/search', params={'q':'Asteroid',
            'category_id': 'uncategorized'}).json()['total'], 0)
        self.client.patch(f'/api/v1/categories/{categories[0]["id"]}', json={'name':'Science'})
        self.assertEqual(self.client.get('/api/v1/categories').json()[1]['name'], 'Science')
        self.client.patch(f'/api/v1/conversations/{self.first}/transcript/segments/s1',
                          json={'text':'Asteroid corrected.', 'expected_revision':1})
        media = storage.data_dir() / 'media' / storage.get_conversation(self.first)['audio_filename']
        self.assertTrue(media.exists())
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.first}/trash').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.first}').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.first}/audio').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/search', params={'q':'Asteroid'}).json()['total'], 0)
        self.assertEqual(len(self.client.get('/api/v1/conversations').json()), 1)
        self.assertEqual(len(self.client.get('/api/v1/trash').json()), 1)
        self.assertEqual(self.client.post('/api/v1/conversations/import',
            files={'file':('same.wav', self.audio, 'audio/wav')}).status_code, 400)
        self.assertEqual(self.client.post(f'/api/v1/trash/{self.first}/restore').status_code, 200)
        restored = self.client.get(f'/api/v1/conversations/{self.first}/transcript').json()
        self.assertEqual(restored['segments'][0]['text'], 'Asteroid corrected.')
        self.assertEqual(len(self.client.get(f'/api/v1/conversations/{self.first}').json()['category_ids']), 2)
        self.client.delete(f'/api/v1/categories/{categories[1]["id"]}')
        self.assertEqual(len(self.client.get('/api/v1/conversations').json()), 2)
        self.assertEqual(len(self.client.get(f'/api/v1/conversations/{self.first}').json()['category_ids']), 1)
        self.client.post(f'/api/v1/conversations/{self.first}/trash')
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.first}').status_code, 200)
        self.assertFalse(media.exists())
        self.assertIsNone(storage.get_conversation(self.first, include_trashed=True))
        self.assertEqual(self.client.get('/api/v1/search', params={'q':'Asteroid'}).json()['total'], 0)
        self.assertEqual(len(self.client.get('/api/v1/categories').json()), 1)
        self.assertEqual(len(self.client.get('/api/v1/conversations').json()), 1)
        with storage.connect() as conn:
            for table in ('transcripts', 'transcript_generations', 'transcript_edits',
                          'transcript_edit_events', 'conversation_categories'):
                self.assertEqual(conn.execute(f'SELECT COUNT(*) FROM {table} WHERE conversation_id = ?',
                                              (self.first,)).fetchone()[0], 0)

    def test_pending_job_blocks_permanent_delete_until_settled(self):
        now = datetime.now(timezone.utc).isoformat()
        job_id = str(uuid.uuid4())
        storage.add_job({'id':job_id, 'conversation_id':self.first, 'pipeline_version':'queued-test',
                         'kind':'speech', 'state':'queued', 'stage':'queued', 'progress':0,
                         'error':None, 'metrics_json':None, 'vocabulary_json':'[]',
                         'created_at':now, 'updated_at':now})
        self.client.post(f'/api/v1/conversations/{self.first}/trash')
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.first}').status_code, 409)
        self.assertEqual(self.client.get('/api/v1/search', params={'q':'Asteroid'}).json()['total'], 0)
        storage.update_job(job_id, state='failed', stage='failed', error='cancelled', updated_at=now)
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.first}').status_code, 200)
        self.assertIsNone(storage.get_job(job_id))

    def test_interrupted_media_staging_recovers_or_cleans_up(self):
        original = storage.data_dir() / 'media' / storage.get_conversation(self.first)['audio_filename']
        staged = original.with_name(f'.deleting-{self.first}-{uuid.uuid4().hex}')
        original.rename(staged)
        library.recover_staged_media()
        self.assertTrue(original.exists())
        self.assertFalse(staged.exists())
        orphan = original.with_name(f'.deleting-{uuid.uuid4()}-{uuid.uuid4().hex}')
        orphan.write_bytes(b'orphan')
        library.recover_staged_media()
        self.assertFalse(orphan.exists())

    def test_confirmed_person_history_survives_rematch_and_reprocessing(self):
        stamp = datetime.now(timezone.utc).isoformat()
        storage.save_transcript({'conversation_id': self.second, 'revision': 1, 'language': 'en',
                                 'segments_json': json.dumps([{'id': 't1', 'start_ms': 100,
                                     'end_ms': 600, 'text': 'Hello again.', 'speaker_cluster_id': 'speaker-9',
                                     'speaker_uncertain': False, 'words': []},
                                     {'id': 't2', 'start_ms': 700, 'end_ms': 900, 'text': 'Another voice.',
                                      'speaker_cluster_id': 'speaker-10', 'speaker_uncertain': True, 'words': []}]),
                                 'turns_json': '[]', 'updated_at': stamp})
        morgan = self.client.post('/api/v1/persons', json={'name':'Morgan'}).json()
        jordan = self.client.post('/api/v1/persons', json={'name':'Jordan'}).json()
        for cid, sid in ((self.first, 's1'), (self.second, 't1')):
            linked = self.client.put(f'/api/v1/conversations/{cid}/person-links', json={
                'person_id':morgan['id'], 'segment_id':sid, 'scope':'cluster', 'expected_revision':1})
            self.assertEqual(linked.status_code, 200)
        profile = self.client.get(f'/api/v1/persons/{morgan["id"]}').json()
        self.assertEqual({item['conversation_id'] for item in profile['conversations']}, {self.first, self.second})
        self.assertEqual(self.client.delete(f'/api/v1/persons/{morgan["id"]}').status_code, 409)
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.second}/transcript').json()['segments'][1].get('person_id'), None)
        self.assertTrue(any(item['kind']=='person' for item in self.client.get('/api/v1/search', params={'q':'Morgan'}).json()['results']))
        self.client.patch(f'/api/v1/persons/{morgan["id"]}', json={'name':'Avery'})
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.first}/transcript').json()['segments'][0]['speaker_display_name'], 'Avery')
        original = storage.get_transcript(self.first)
        rematched = [{**item, 'speaker_cluster_id':'speaker-new'} for item in json.loads(original['segments_json'])]
        storage.save_transcript({'conversation_id':self.first, 'pipeline_version':'rematch-test',
                                 'language':'en', 'segments_json':json.dumps(rematched),
                                 'turns_json':'[]', 'updated_at':stamp})
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.first}/transcript').json()['segments'][0]['person_id'], morgan['id'])
        reprocessed = [{**rematched[0], 'id':'replacement-s1'}]
        storage.save_transcript({'conversation_id':self.first, 'pipeline_version':'reprocess-test',
                                 'language':'en', 'segments_json':json.dumps(reprocessed),
                                 'turns_json':'[]', 'updated_at':stamp})
        self.assertNotIn('person_id', self.client.get(f'/api/v1/conversations/{self.first}/transcript').json()['segments'][0])
        historical = self.client.get(f'/api/v1/persons/{morgan["id"]}').json()['conversations']
        self.assertFalse(next(item for item in historical if item['conversation_id']==self.first)['current_generation'])
        self.client.put(f'/api/v1/conversations/{self.second}/person-links', json={
            'person_id':jordan['id'], 'segment_id':'t2', 'scope':'segment', 'expected_revision':1})
        self.assertEqual(self.client.post(f'/api/v1/persons/{morgan["id"]}/merge',
            json={'source_id':jordan['id']}).status_code, 200)
        separated = self.client.post('/api/v1/persons', json={'name':'Casey'}).json()
        self.assertEqual(self.client.post(f'/api/v1/persons/{morgan["id"]}/move-conversation',
            json={'conversation_id':self.second,'target_id':separated['id']}).json()['moved'], 2)
        self.assertEqual(len(self.client.get(f'/api/v1/persons/{morgan["id"]}').json()['conversations']), 1)
        self.client.post(f'/api/v1/conversations/{self.first}/trash')
        self.assertEqual(self.client.get(f'/api/v1/persons/{morgan["id"]}').json()['conversations'], [])
        self.client.post(f'/api/v1/trash/{self.first}/restore')
        self.assertEqual(len(self.client.get(f'/api/v1/persons/{morgan["id"]}').json()['conversations']), 1)
        self.client.post(f'/api/v1/conversations/{self.first}/trash')
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.first}').status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/persons/{morgan["id"]}').json()['conversations'], [])
        self.assertEqual(len(self.client.get(f'/api/v1/persons/{separated["id"]}').json()['conversations']), 1)
        self.assertEqual(self.client.delete(f'/api/v1/persons/{morgan["id"]}').status_code, 200)
        self.assertEqual(self.client.delete(f'/api/v1/persons/{separated["id"]}/conversations/{self.second}').status_code, 200)
        self.assertEqual(self.client.delete(f'/api/v1/persons/{separated["id"]}').status_code, 200)
        self.assertFalse(any(item['kind']=='person' for item in self.client.get('/api/v1/search',
                                                                                 params={'q':'Casey'}).json()['results']))


if __name__ == '__main__':
    unittest.main()
