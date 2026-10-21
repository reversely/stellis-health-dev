"""Explicit recipient boundaries and shared-job projections."""
import asyncio,os,tempfile,unittest
from unittest.mock import patch
from stellis import agents,agent_handoffs,agent_runtime,agent_artifacts,notebooks,notebook_work,storage

class HandoffTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.env=patch.dict(os.environ,{'STELLIS_DATA_DIR':self.temp.name},clear=True);self.env.start()
        self.book=notebooks.create('Project');self.other=notebooks.create('Private')
        self.origin=agents.create('Coordinator','Coordinate',notebook_id=self.book['id'])
        self.target=agents.create('Tutor','Teach',notebook_id=self.book['id'])
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def test_requires_shared_enabled_notebook_and_account(self):
        ids=(self.origin['id'],self.target['id'],self.book['id'])
        self.assertEqual(agent_handoffs.validate(*ids)['id'],self.target['id'])
        with self.assertRaises(ValueError):agent_handoffs.validate(*ids[:2],None)
        with self.assertRaises(ValueError):agent_handoffs.validate(*ids[:2],self.other['id'])
        agents.set_notebook_enabled(self.target['id'],self.book['id'],False)
        with self.assertRaises(ValueError):agent_handoffs.validate(*ids)
        with tempfile.TemporaryDirectory() as other,patch.dict(os.environ,{'STELLIS_DATA_DIR':other}):
            with self.assertRaises(LookupError):agent_handoffs.validate(*ids)
    def test_shared_job_author_and_live_artifact_projection(self):
        job=agents.start_job(self.origin['id'],self.book['id'])
        message=agents.append_message(self.target['id'],'agent','Draft ready',self.book['id'],job)
        artifact=agent_artifacts.create(self.target['id'],message['id'],self.book['id'],'Review','Check the notes.',[])
        relay=agents.append_message(self.origin['id'],'agent','Draft ready',self.book['id'],job)
        with storage.connect() as conn:
            conn.execute('INSERT INTO agent_handoffs VALUES(?,?,?,?,?,?,?)',(job,self.origin['id'],self.target['id'],self.target['name'],self.book['id'],relay['id'],message['id']))
        self.assertEqual(agents.jobs(self.origin['id'])[0]['id'],agents.jobs(self.target['id'])[0]['id'])
        projected=agents.messages(self.origin['id'])[0]
        self.assertEqual(projected['addressed_agent_name'],'Tutor')
        self.assertEqual(projected['routed_artifact']['id'],artifact['id'])
        agents.finish_job(job,'succeeded')
        self.assertEqual(len(notebook_work.activity(self.book['id'])['items']),1)
        agent_artifacts.discard(artifact['id'],1)
        self.assertEqual(agents.messages(self.origin['id'])[0]['routed_artifact']['state'],'discarded')
