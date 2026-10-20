"""Persisted mail-rule boundaries without calling an external provider."""
import asyncio
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import agents, notebooks, mail_runs, calendar, storage

class MailRulesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'STELLIS_DATA_DIR':self.temp.name,'STELLIS_GOOGLE_CALENDAR_CLIENT_ID':'unit-test-client'}, clear=True)
        self.env.start()
        self.book = notebooks.create('Work')
        self.writer = agents.create('Writer', 'Writing', template_id='writing', notebook_id=self.book['id'])
        self.ids = (self.writer['id'], self.book['id'])

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def grant(self):
        calendar._save('google', {'access_token':'unit-test-only', 'refresh_token':'unit-test-only',
            'scope':'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'})

    def test_rule_requires_grant_and_scoped_assignment_and_honors_off(self):
        self.assertFalse(mail_runs.status(*self.ids)['active'])
        with self.assertRaises(ValueError):mail_runs.configure(*self.ids, 'label:project', True)
        self.grant()
        first = mail_runs.configure(*self.ids, 'label:project', True)
        self.assertTrue(first['active'])
        self.assertEqual(mail_runs.configure(*self.ids, 'label:project', True)['since'], first['since'])
        agents.set_notebook_enabled(*self.ids, False)
        self.assertFalse(mail_runs.status(*self.ids)['active'])
        agents.set_notebook_enabled(*self.ids, True)
        self.assertTrue(mail_runs.status(*self.ids)['active'])
        agents.unassign(*self.ids)
        self.assertFalse(mail_runs._enabled(*self.ids))
        with self.assertRaises(ValueError):mail_runs.configure(*self.ids, 'label:project', True)

    def test_disable_cancels_active_check_and_account_isolation(self):
        self.grant();mail_runs.configure(*self.ids, 'label:project', True)
        async def run():
            task = asyncio.create_task(asyncio.sleep(100))
            mail_runs._active[self.ids] = task
            try:
                self.assertFalse(mail_runs.configure(*self.ids, 'label:project', False)['enabled'])
                await asyncio.gather(task, return_exceptions=True)
                self.assertTrue(task.cancelled())
            finally:mail_runs._active.pop(self.ids, None)
        asyncio.run(run())
        with tempfile.TemporaryDirectory() as other, patch.dict(os.environ, {'STELLIS_DATA_DIR':other}):
            with self.assertRaises(LookupError):mail_runs.status(*self.ids)

    def test_restart_preserves_claim_as_interrupted(self):
        with mail_runs._db() as conn:
            conn.execute('INSERT INTO mail_run_events VALUES(?,?,?,?,?,?,?,?)', (*self.ids,'thread','message','working','',None,1))
        async def run():
            await mail_runs.start()
            await mail_runs.stop()
        asyncio.run(run())
        event = mail_runs.status(*self.ids)['events'][0]
        self.assertEqual(event['state'], 'interrupted')
        with mail_runs._db() as conn:
            duplicate = conn.execute('INSERT OR IGNORE INTO mail_run_events VALUES(?,?,?,?,?,?,?,?)', (*self.ids,'thread','message','working','',None,2))
            self.assertEqual(duplicate.rowcount, 0)

    def test_old_sent_bulk_and_claimed_threads_do_not_start_inference(self):
        self.grant();mail_runs.configure(*self.ids, 'label:project', True)
        async def run():
            for message in [
                {'id':'old','internalDate':'1000'},
                {'id':'sent','internalDate':'9000','labelIds':['SENT']},
                {'id':'bulk','internalDate':'9000','bulk_mail':True},
            ]:
                await mail_runs.process_thread(*self.ids, {'id':'ignored','messages':[message]}, 5)
            self.assertEqual(mail_runs.status(*self.ids)['events'], [])
            with mail_runs._db() as conn:
                conn.execute('INSERT INTO mail_run_events VALUES(?,?,?,?,?,?,?,?)', (*self.ids,'claimed','message','skipped','',None,1))
            await mail_runs.process_thread(*self.ids, {'id':'claimed','messages':[{'id':'message','internalDate':'9000'}]}, 5)
            self.assertEqual(len(mail_runs.status(*self.ids)['events']), 1)
        asyncio.run(run())
