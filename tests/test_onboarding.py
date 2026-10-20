"""First-run persistence and reviewed setup, without provider doubles."""
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from stellis import agents, auth, collections, notebooks, onboarding, pages

class OnboardingTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'STELLIS_DATA_DIR':self.tmp.name,'STELLIS_AUTH_DB_DIR':self.tmp.name,'STELLIS_AUTH_MODE':'required'},clear=True)
        self.env.start()
    def tearDown(self):
        self.env.stop();self.tmp.cleanup()
    def account(self):
        auth.register('learner','correct horse battery staple');return auth.account_id_for_username('learner')
    def test_review_creates_once_and_preserves_changes_on_repeat(self):
        account=self.account()
        self.assertTrue(auth.needs_onboarding(account))
        with self.assertRaises(ValueError):onboarding.complete(account)
        onboarding.choose(account,['learning','meetings'],'review')
        self.assertEqual(notebooks.list_notebooks(),[])
        first=onboarding.complete(account)
        self.assertFalse(auth.needs_onboarding(account))
        self.assertEqual(len(notebooks.list_notebooks()),2)
        self.assertEqual(len(collections.list_collections()),2)
        book=next(b for b in notebooks.list_notebooks() if b['name']=='Learning')
        self.assertEqual(pages.list_pages(book['id']), [])
        tutor=next(a for a in agents.list_agents() if a.get('template_id')=='tutor')
        self.assertEqual(tutor['notebooks'][0]['notebook_id'],book['id'])
        agents.update(tutor['id'],name='My tutor')
        self.assertEqual(onboarding.complete(account),first)
        self.assertEqual(agents.get(tutor['id'])['name'],'My tutor')
    def test_empty_setup_and_invalid_choices(self):
        account=self.account()
        with self.assertRaises(ValueError):onboarding.choose(account,['invented'],'review')
        onboarding.choose(account,[],'review');onboarding.complete(account)
        self.assertEqual(notebooks.list_notebooks(),[])
        self.assertEqual(agents.list_agents()[0]['name'],'Chief of Staff')
    def test_preexisting_accounts_are_not_sent_back_to_setup(self):
        path=Path(self.tmp.name)/'auth.sqlite3'
        with sqlite3.connect(path) as conn:
            conn.execute('CREATE TABLE account (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, verifier BLOB NOT NULL, created_at TEXT NOT NULL)')
            conn.execute("INSERT INTO account VALUES(1,'existing',X'01',X'01','2026-01-01')")
        self.assertFalse(auth.needs_onboarding(1))
        self.assertTrue(auth.needs_onboarding(self.account()))

    def test_agent_plan_survives_back_and_applies_exact_selection(self):
        account=self.account()
        onboarding.choose(account,['learning','family'],'review',{'learning':['writing'],'family':[]})
        onboarding.choose(account,['learning','family'],'uses')
        state=onboarding.choose(account,['learning','family'],'review')
        self.assertEqual(state['agent_choices'],{'learning':['writing'],'family':[]})
        result=onboarding.complete(account)
        learning=next(b for b in result['created'] if b['name']=='Learning')
        family=next(b for b in result['created'] if b['name']=='Family')
        self.assertEqual([agents.get(i)['template_id'] for i in learning['agent_ids']],['writing'])
        self.assertEqual(family['agent_ids'],[])
        self.assertEqual(onboarding.complete(account),result)

    def test_reopen_is_additive_and_repeated_completion_is_idempotent(self):
        account=self.account();onboarding.choose(account,['learning'],'review');first=onboarding.complete(account)
        old_id=first['created'][0]['notebook_id']
        state=onboarding.reopen(account)
        self.assertTrue(state['required']);self.assertFalse(auth.needs_onboarding(account))
        self.assertEqual(state['uses'],[])
        onboarding.choose(account,['family','slides'],'review',{'family':['schedule'],'slides':['slides']})
        second=onboarding.complete(account)
        self.assertEqual(len(notebooks.list_notebooks()),3)
        self.assertTrue(any(book['id']==old_id for book in notebooks.list_notebooks()))
        self.assertFalse(onboarding.status(account)['required'])
        self.assertEqual(onboarding.complete(account),second)

    def test_invalid_agent_plan_does_not_mutate_setup(self):
        account=self.account();before=onboarding.status(account)
        with self.assertRaises(ValueError):onboarding.choose(account,['learning'],'review',{'learning':['invented']})
        self.assertEqual(onboarding.status(account)['step'],before['step'])
