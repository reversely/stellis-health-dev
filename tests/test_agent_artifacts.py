"""Real local artifact persistence, revisions and external retry boundaries."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import agent_artifacts as drafts, agents, agent_runtime, storage

class ArtifactTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.env=patch.dict(os.environ,{'STELLIS_DATA_DIR':self.temp.name},clear=True);self.env.start()
        self.agent=agents.create('Writer','Writing');self.message=agents.append_message(self.agent['id'],'agent','Draft ready')
        self.draft=drafts.create(self.agent['id'],self.message['id'],None,'email','Subject','First paragraph.\n\nSecond paragraph.',['reader@example.com'],[])
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def test_edits_preserve_paragraphs_reject_stale_and_discard_keeps_record(self):
        changed=drafts.edit(self.draft['id'],1,'Edited','A\n\nB',['new@example.com']);self.assertEqual(changed['revision'],2);self.assertEqual(drafts.get(changed['id'])['body'],'A\n\nB')
        with self.assertRaises(ValueError):drafts.edit(changed['id'],1,'Stale','Old',[])
        discarded=drafts.discard(changed['id'],2);self.assertEqual(discarded['state'],'discarded')
        with self.assertRaises(ValueError):drafts.edit(changed['id'],3,'Cannot edit','Body',[])
    def test_interrupted_saves_cannot_be_retried_as_new_writes(self):
        with storage.connect() as conn:conn.execute("UPDATE agent_artifacts SET state='saving' WHERE id=?",(self.draft['id'],))
        drafts.interrupt_saves();self.assertEqual(drafts.get(self.draft['id'])['state'],'save_unknown')
        import asyncio
        with self.assertRaises(ValueError):asyncio.run(drafts.save_to_gmail(self.draft['id'],1))
    def test_account_isolation_and_safe_generated_recipients(self):
        parsed=drafts.parse(json.dumps({'title':'Hello','body':'Draft','recipients':['invented@example.com','real@example.com']}),'Draft to real@example.com',[])
        self.assertEqual(parsed['recipients'],['real@example.com'])
        with tempfile.TemporaryDirectory() as other,patch.dict(os.environ,{'STELLIS_DATA_DIR':other}):
            with self.assertRaises(LookupError):drafts.get(self.draft['id'])
    def test_artifact_requests_have_complete_output_contract(self):
        prompt=agent_runtime._prompt(self.agent,[],[],'Draft an email to reader@example.com',[])
        self.assertIn('complete draft',prompt);self.assertNotIn('at most 130 words',prompt)
        self.assertEqual(drafts.kind_for('Write questions for the walkthrough'),'document')
        self.assertEqual(drafts.kind_for('Could you please draft a reply?'),'email')
        self.assertIsNone(drafts.kind_for('What changed?'))

    def test_document_files_once_and_keeps_paragraphs(self):
        from stellis import notebooks, pages
        book=notebooks.create('Learning')
        draft=drafts.create(self.agent['id'],None,book['id'],'document','Practice questions','One?\n\nTwo?',[],[])
        filed=drafts.save_note(draft['id'],1)
        self.assertEqual(filed['state'],'filed')
        self.assertEqual(pages.get(draft['id'])['markdown'],'One?\n\nTwo?')
        self.assertEqual(drafts.save_note(draft['id'],1)['id'],draft['id'])
        self.assertEqual(len(pages.list_pages(book['id'])),1)
