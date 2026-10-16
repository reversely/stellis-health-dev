"""Review boundaries between an edited source and a new ASR generation."""

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import generation_review, storage
from stellis.server import app
from test_import import wav_bytes


class GenerationReviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name})
        self.env.start()
        self.client = TestClient(app)
        self.id = self.client.post('/api/v1/conversations/import',
                                   files={'file':('review.wav',wav_bytes(),'audio/wav')}).json()['conversation']['id']
        stamp = datetime.now(timezone.utc).isoformat()
        self.source = [
            {'id':'s1','start_ms':0,'end_ms':600,'text':'Hello orbit.',
             'speaker_cluster_id':'speaker-1','speaker_uncertain':False,'words':[]},
            {'id':'s2','start_ms':600,'end_ms':1000,'text':'Second voice.',
             'speaker_cluster_id':'speaker-2','speaker_uncertain':False,'words':[]},
            {'id':'s3','start_ms':1000,'end_ms':1400,'text':'Closing words.',
             'speaker_cluster_id':'speaker-2','speaker_uncertain':False,'words':[]},
        ]
        storage.save_transcript({'conversation_id':self.id,'revision':1,'pipeline_version':'source-v1',
                                 'language':'en','segments_json':json.dumps(self.source),
                                 'turns_json':'[]','updated_at':stamp})
        self.client.patch(f'/api/v1/conversations/{self.id}/transcript/segments/s1',
                          json={'text':'Hello world orbit.','expected_revision':1})
        self.client.patch(f'/api/v1/conversations/{self.id}/transcript/segments/s3',
                          json={'text':'Closing worlds.','expected_revision':2})
        self.client.put(f'/api/v1/conversations/{self.id}/speakers/label', json={
            'scope':'segment','target_id':'s2','name':'Interviewer','expected_revision':3})
        self.client.post(f'/api/v1/conversations/{self.id}/highlights', json={
            'segment_id':'s1','start_offset':0,'end_offset':5,'expected_revision':4})
        self.person = self.client.post('/api/v1/persons',json={'name':'Morgan'}).json()
        self.client.put(f'/api/v1/conversations/{self.id}/person-links',json={
            'person_id':self.person['id'],'segment_id':'s1','scope':'segment','expected_revision':4})
        self.target = [
            {'id':'t1','start_ms':0,'end_ms':260,'text':'Hello',
             'speaker_cluster_id':'speaker-9','speaker_uncertain':True,'words':[]},
            {'id':'t2','start_ms':260,'end_ms':600,'text':'orbit.',
             'speaker_cluster_id':'speaker-9','speaker_uncertain':True,'words':[]},
            {'id':'t3','start_ms':600,'end_ms':1400,'text':'Second voice. Closing words.',
             'speaker_cluster_id':'speaker-10','speaker_uncertain':True,'words':[]},
        ]
        self.record = {'conversation_id':self.id,'pipeline_version':'target-v2','language':'en',
                       'segments_json':json.dumps(self.target),'turns_json':'[]','updated_at':stamp}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def test_split_and_merge_require_decisions_and_preserve_unresolved_source(self):
        self.assertTrue(generation_review.stage(self.record))
        current = self.client.get(f'/api/v1/conversations/{self.id}/transcript').json()
        self.assertEqual(current['generation_version'],'source-v1')
        self.assertEqual(current['segments'][0]['text'],'Hello world orbit.')
        review = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()
        self.assertEqual(review['state'],'pending')
        self.assertEqual(len(review['items']),5)
        self.assertEqual(next(item for item in review['items'] if item['source_segment_id']=='s1')['boundary_change'],'split')
        self.assertEqual(next(item for item in review['items'] if item['source_segment_id']=='s2')['boundary_change'],'merge')
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/activate').status_code,409)
        for item in review['items']:
            target = {'person':'t1','highlight':'t1','speaker':'t3'}.get(item['kind'])
            response = self.client.put(f'/api/v1/conversations/{self.id}/transcript/review/decisions',
                json={'item_id':item['id'],'target_segment_id':target})
            self.assertEqual(response.status_code,200)
        result = self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/activate')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['unresolved'],2)
        after = self.client.get(f'/api/v1/conversations/{self.id}/transcript').json()
        self.assertEqual(after['generation_version'],'target-v2')
        self.assertEqual(after['segments'][0]['person_id'],self.person['id'])
        self.assertEqual(after['segments'][2]['speaker_display_name'],'Interviewer')
        self.assertEqual(after['highlights'][-1]['segment_id'],'t1')
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()['state'],'accepted')
        history = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review/history').json()
        self.assertEqual(history[0]['outcome'],'accepted')
        self.assertEqual(history[0]['target_version'],'target-v2')
        with storage.connect() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM transcript_edits WHERE conversation_id=?',(self.id,)).fetchone()[0],2)
        self.client.post(f'/api/v1/conversations/{self.id}/trash')
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.id}').status_code,200)
        self.assertEqual(self.client.get(f'/api/v1/persons/{self.person["id"]}').json()['total_link_count'],0)

    def test_keep_source_does_not_activate_candidate(self):
        self.assertTrue(generation_review.stage(self.record))
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/keep-source').status_code,200)
        self.assertIsNone(self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json())
        self.assertEqual(storage.get_transcript(self.id)['generation_version'],'source-v1')
        self.assertIsNotNone(storage.get_transcript_generation(self.id,'target-v2'))
        self.assertEqual(self.client.get(f'/api/v1/conversations/{self.id}/transcript/review/history').json()[0]['outcome'],
                         'kept_source')

    def test_close_suggestion_never_maps_confirmed_person_automatically(self):
        self.target[0] = {**self.source[0], 'id':'new-s1'}
        self.target[1] = {**self.source[1], 'id':'new-s2'}
        self.target[2] = {**self.source[2], 'id':'new-s3'}
        self.record['segments_json'] = json.dumps(self.target)
        self.assertTrue(generation_review.stage(self.record))
        review = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()
        person_item = next(item for item in review['items'] if item['kind']=='person')
        self.assertEqual(person_item['suggestion'],'new-s1')
        self.assertEqual(review['decisions'],{})
        self.assertEqual(storage.get_transcript(self.id)['generation_version'],'source-v1')
        self.assertEqual(self.client.get(f'/api/v1/persons/{self.person["id"]}').json()['total_link_count'],1)

    def test_invalid_highlight_mapping_keeps_old_generation_and_anchors(self):
        self.assertTrue(generation_review.stage(self.record))
        review = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()
        for item in review['items']:
            target = 't2' if item['kind']=='highlight' else None
            self.client.put(f'/api/v1/conversations/{self.id}/transcript/review/decisions',
                            json={'item_id':item['id'],'target_segment_id':target})
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/activate').status_code,409)
        self.assertEqual(storage.get_transcript(self.id)['generation_version'],'source-v1')
        self.assertEqual(len(storage.list_highlights(self.id)),1)

    def test_comment_requires_explicit_remap_and_is_deleted_with_conversation(self):
        created = self.client.post(f'/api/v1/conversations/{self.id}/comments',json={
            'segment_id':'s1','start_offset':0,'end_offset':5,
            'body':'Check opening','expected_revision':4})
        self.assertEqual(created.status_code,200,created.text)
        comment_id = created.json()['id']
        self.assertTrue(generation_review.stage(self.record))
        review = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()
        comment_item = next(item for item in review['items'] if item['kind']=='comment')
        self.assertEqual(comment_item['source_comment_id'],comment_id)
        for item in review['items']:
            self.client.put(f'/api/v1/conversations/{self.id}/transcript/review/decisions',json={
                'item_id':item['id'],'target_segment_id':'t1' if item['kind']=='comment' else None})
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/activate').status_code,200)
        mapped = storage.list_comments(self.id)[0]
        self.assertEqual((mapped['id'],mapped['segment_id'],mapped['quote']),(comment_id,'t1','Hello'))
        self.client.post(f'/api/v1/conversations/{self.id}/trash')
        self.assertEqual(self.client.delete(f'/api/v1/trash/{self.id}').status_code,200)
        with storage.connect() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM transcript_comments WHERE id=?',(comment_id,)).fetchone()[0],0)

    def test_ambiguous_comment_quote_cannot_be_silently_remapped(self):
        created = self.client.post(f'/api/v1/conversations/{self.id}/comments',json={
            'segment_id':'s1','start_offset':0,'end_offset':5,
            'body':'Two Hellos','expected_revision':4})
        self.assertEqual(created.status_code,200)
        self.target[0]['text'] = 'Hello Hello'
        self.record['segments_json'] = json.dumps(self.target)
        self.assertTrue(generation_review.stage(self.record))
        review = self.client.get(f'/api/v1/conversations/{self.id}/transcript/review').json()
        for item in review['items']:
            self.client.put(f'/api/v1/conversations/{self.id}/transcript/review/decisions',json={
                'item_id':item['id'],'target_segment_id':'t1' if item['kind']=='comment' else None})
        self.assertEqual(self.client.post(f'/api/v1/conversations/{self.id}/transcript/review/activate').status_code,409)
        self.assertEqual(storage.list_comments(self.id)[0]['segment_id'],'s1')


if __name__ == '__main__':
    unittest.main()
