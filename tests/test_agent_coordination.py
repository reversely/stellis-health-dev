"""Planning boundaries and persisted work state, without an inference double."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch
from stellis import agent_coordination as work, agent_runtime, agents, notebooks


class CoordinationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'STELLIS_DATA_DIR': self.temp.name}, clear=True)
        self.env.start()
        self.book = notebooks.create('Project')
        self.origin = agents.create('Writer', 'Write', notebook_id=self.book['id'])
        self.other = agents.create('Reviewer', 'Check evidence', notebook_id=self.book['id'])

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_plan_accepts_only_distinct_enabled_notebook_participants(self):
        eligible = work.participants(self.origin['id'], self.book['id'])
        step = {'agent_id': self.other['id'], 'task': 'Check the saved evidence.'}
        self.assertEqual(work.parse_plan(json.dumps({'steps': [step]}), eligible, self.origin['id']), [step])
        for value in ([step, step], [{'agent_id': 'missing', 'task': 'Check'}], [dict(step, task='')], [dict(step, unexpected=True)]):
            with self.assertRaises(agent_runtime.AgentRunError):
                work.parse_plan(json.dumps({'steps': value}), eligible, self.origin['id'])
        agents.set_notebook_enabled(self.other['id'], self.book['id'], False)
        eligible = work.participants(self.origin['id'], self.book['id'])
        self.assertNotIn(self.other['id'], {a['id'] for a in eligible})
        with self.assertRaises(agent_runtime.AgentRunError):
            work.parse_plan(json.dumps({'steps': [step]}), eligible, self.origin['id'])

    def test_step_projection_and_restart_do_not_repeat_work(self):
        job = agents.start_job(self.origin['id'], self.book['id'])
        first = work.add_step(job, 0, self.other, 'Check evidence')
        second = work.add_step(job, 1, self.origin, 'Prepare response')
        work.update_step(first, 'running')
        self.assertEqual(agents.jobs(self.origin['id'])[0]['steps'][0]['state'], 'running')
        agents.interrupt_running_jobs()
        self.assertEqual([s['state'] for s in work.steps(job)], ['interrupted', 'skipped'])
        self.assertEqual(agents.jobs(self.origin['id'])[0]['state'], 'interrupted')
